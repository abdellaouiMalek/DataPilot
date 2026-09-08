"""Scoring referential endpoints, the maturity bands a score is mapped to.

The bands live in ``maturity_levels`` and are read by every scoring path
(``app.services.scoring.map_to_maturity_level``, the assessment and report
routers), so editing them here changes how existing and future results are
labelled. Two invariants are enforced on write, because breaking either makes
the mapper silently return the wrong label (or ``None``):

* bands must not overlap, the mapper takes the first match by ``min_score``;
* bands must stay inside the questionnaire scale (0 → ``MAX_LEVEL``).

Gaps are reported but not rejected: a partially-covered scale is a
configuration the admin may be mid-way through, and it only costs a missing
label rather than a wrong one.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.db.database import get_db
from app.db.seed import MATURITY_LEVELS
from app.models import MaturityLevel
from app.models.audit_log import MODULE_SCORING
from app.schemas.admin_scoring import (
    MaturityLevelAdminRead,
    MaturityLevelUpdate,
    ScoringReferentialRead,
    ScoringScale,
)
from app.services.audit import (
    STATUS_WARNING,
    Audit,
    audit_context,
    summarize_changes,
)
from app.services.scoring import MAX_LEVEL

router = APIRouter(
    prefix="/api/super-admin/scoring",
    tags=["super-admin-scoring"],
    dependencies=[Depends(require_super_admin)],
)

SCALE_MIN = 0.0
SCALE_MAX = float(MAX_LEVEL)

# Field -> French label, for the "avant → après" text on a band edit.
LEVEL_FIELD_LABELS = {
    "label": "Libellé",
    "min_score": "Score min",
    "max_score": "Score max",
    "color": "Couleur",
    "description": "Description",
}


def _fmt(value: float) -> str:
    """1.9 -> "1.9", 2.0 -> "2", keeps the French messages readable."""
    return f"{value:g}"


async def _levels(db: AsyncSession) -> list[MaturityLevel]:
    stmt = select(MaturityLevel).order_by(MaturityLevel.sort_order, MaturityLevel.id)
    return list((await db.execute(stmt)).scalars().all())


def _overlaps(levels: list[MaturityLevel]) -> list[str]:
    ordered = sorted(levels, key=lambda level: (level.min_score, level.max_score))
    messages: list[str] = []
    for previous, current in zip(ordered, ordered[1:]):
        if current.min_score <= previous.max_score:
            messages.append(
                f"« {previous.label} » ({_fmt(previous.min_score)}-{_fmt(previous.max_score)}) "
                f"et « {current.label} » ({_fmt(current.min_score)}-{_fmt(current.max_score)}) "
                "se chevauchent"
            )
    return messages


def _gaps(levels: list[MaturityLevel]) -> list[str]:
    """Score ranges no band covers. Uses the seeded 0.1 granularity."""
    if not levels:
        return [f"{_fmt(SCALE_MIN)} - {_fmt(SCALE_MAX)}"]

    ordered = sorted(levels, key=lambda level: level.min_score)
    messages: list[str] = []

    if ordered[0].min_score > SCALE_MIN:
        messages.append(f"{_fmt(SCALE_MIN)} - {_fmt(ordered[0].min_score)}")

    for previous, current in zip(ordered, ordered[1:]):
        # 0.1 apart is contiguous on this scale (1.9 → 2.0), not a gap.
        if current.min_score - previous.max_score > 0.1001:
            messages.append(f"{_fmt(previous.max_score)} - {_fmt(current.min_score)}")

    last_max = max(level.max_score for level in ordered)
    if last_max < SCALE_MAX:
        messages.append(f"{_fmt(last_max)} - {_fmt(SCALE_MAX)}")

    return messages


def _referential(levels: list[MaturityLevel]) -> ScoringReferentialRead:
    return ScoringReferentialRead(
        scale=ScoringScale(min=SCALE_MIN, max=SCALE_MAX),
        levels=[MaturityLevelAdminRead.model_validate(level) for level in levels],
        overlaps=_overlaps(levels),
        gaps=_gaps(levels),
    )


def _validate(min_score: float, max_score: float, others: list[MaturityLevel]) -> None:
    """Checked against the *candidate* values, before anything is assigned, so
    a rejected edit never leaves a half-applied band in the session."""
    if min_score > max_score:
        raise HTTPException(
            status_code=400,
            detail="Le score minimum doit être inférieur ou égal au score maximum.",
        )
    if min_score < SCALE_MIN or max_score > SCALE_MAX:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Les seuils doivent rester dans l'échelle du questionnaire "
                f"({_fmt(SCALE_MIN)} - {_fmt(SCALE_MAX)})."
            ),
        )
    for other in others:
        if min_score <= other.max_score and other.min_score <= max_score:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Chevauchement avec « {other.label} » "
                    f"({_fmt(other.min_score)} - {_fmt(other.max_score)})."
                ),
            )


@router.get("/referential", response_model=ScoringReferentialRead)
async def get_referential(db: AsyncSession = Depends(get_db)):
    return _referential(await _levels(db))


@router.patch("/maturity-levels/{level_id}", response_model=ScoringReferentialRead)
async def update_maturity_level(
    level_id: int,
    payload: MaturityLevelUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    levels = await _levels(db)
    level = next((candidate for candidate in levels if candidate.id == level_id), None)
    if level is None:
        raise HTTPException(status_code=404, detail="Niveau de maturité introuvable")

    changes = payload.model_dump(exclude_unset=True)
    _validate(
        changes.get("min_score", level.min_score),
        changes.get("max_score", level.max_score),
        [other for other in levels if other.id != level_id],
    )

    previous = {
        field: getattr(level, field)
        for field in LEVEL_FIELD_LABELS
        if hasattr(level, field)
    }
    for field, value in changes.items():
        setattr(level, field, value)

    await db.commit()

    before, after, fields = summarize_changes(
        previous,
        {field: getattr(level, field) for field in previous},
        LEVEL_FIELD_LABELS,
    )
    if fields:
        await audit.record(
            module=MODULE_SCORING,
            action=f"Modification seuil, Niveau {level.label}",
            entity_type="maturity_level",
            entity_id=level.id,
            entity_label=level.label,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return _referential(await _levels(db))


@router.post("/maturity-levels/reset", response_model=ScoringReferentialRead)
async def reset_maturity_levels(
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    """Restore the seeded bands.

    Rows are updated in place (matched on ``sort_order``) rather than dropped
    and re-inserted, so ids stay stable for anything referencing them.
    """
    existing = await _levels(db)
    by_order = {level.sort_order: level for level in existing}

    for order, defaults in enumerate(MATURITY_LEVELS):
        level = by_order.pop(order, None)
        if level is None:
            db.add(MaturityLevel(sort_order=order, **defaults))
            continue
        for field, value in defaults.items():
            setattr(level, field, value)

    # Bands added beyond the seeded set have no default to restore.
    for leftover in by_order.values():
        await db.delete(leftover)

    await db.commit()

    # Recorded as a warning, not a plain success: it discards every custom
    # band in one click and past results get re-labelled as a side effect.
    await audit.record(
        module=MODULE_SCORING,
        action="Restauration des paramètres de scoring",
        status=STATUS_WARNING,
        entity_type="maturity_level",
        before=f"{len(existing)} niveaux personnalisés",
        after=f"{len(MATURITY_LEVELS)} niveaux par défaut",
    )
    return _referential(await _levels(db))
