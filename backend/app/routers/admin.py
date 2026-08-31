"""Admin back-office endpoints — CRUD over the framework (Dimension →
Sub-dimension → Question) plus their attributes (weight, color, type).

Writes require the realm ``super_admin`` role. The plain-read endpoints
(``GET /dimensions``, ``GET /dimensions/{id}``, ``GET /questions``) are
additionally open to the reduced ``admin`` role (`require_back_office`) so
its "Gestion du framework" page (read-only, see
frontend/src/pages/superAdmin/AdminDimensions.tsx::FrameworkConsultation)
can consult the real framework — every other route here (create/update/
delete, and the force-delete impact previews) stays super-admin-only,
enforced per-route rather than at the router level.
"""

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_back_office, require_super_admin
from app.db.database import get_db
from app.models.audit_log import MODULE_FRAMEWORK
from app.models import (
    Answer,
    Dimension,
    DimensionScore,
    Question,
    Recommendation,
    SubDimension,
)
from app.schemas.admin import (
    DeleteImpact,
    DimensionAdminRead,
    DimensionCreate,
    DimensionUpdate,
    QuestionAdminRead,
    QuestionCreate,
    QuestionUpdate,
    RecommendationAdminRead,
    RecommendationBatchCreateResult,
    RecommendationCreate,
    RecommendationUpdate,
    SubDimensionAdminRead,
    SubDimensionCreate,
    SubDimensionUpdate,
)
from app.services.audit import (
    STATUS_FAILURE,
    Audit,
    audit_context,
    summarize_changes,
)

router = APIRouter(
    prefix="/api/super-admin",
    tags=["super-admin"],
)

# Field -> French label, for the "avant → après" text on framework edits.
DIMENSION_FIELD_LABELS = {
    "name": "Nom",
    "description": "Description",
    "weight": "Poids",
    "color": "Couleur",
    "sort_order": "Ordre",
    "is_active": "Active",
}

SUBDIMENSION_FIELD_LABELS = {
    "name": "Nom",
    "dimension_id": "Dimension",
    "sort_order": "Ordre",
    "is_active": "Active",
}

QUESTION_FIELD_LABELS = {
    "text": "Libellé",
    "description": "Description",
    "type": "Type",
    "weight": "Poids",
    "sub_dimension_id": "Sous-dimension",
    "sort_order": "Ordre",
    "is_required": "Obligatoire",
    "is_active": "Active",
}


REFERENCED_409 = (
    "Élément référencé par des évaluations existantes. "
    "Désactivez-le (is_active=false) au lieu de le supprimer."
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "dimension"


async def _unique_key(db: AsyncSession, base: str) -> str:
    key, i = base, 2
    while await db.scalar(select(Dimension.id).where(Dimension.key == key)):
        key = f"{base}-{i}"
        i += 1
    return key


def _dimension_query():
    return select(Dimension).options(
        selectinload(Dimension.sub_dimensions).selectinload(SubDimension.questions)
    )


async def _get_dimension_or_404(db: AsyncSession, dimension_id: int) -> Dimension:
    dim = await db.scalar(_dimension_query().where(Dimension.id == dimension_id))
    if dim is None:
        raise HTTPException(status_code=404, detail="Dimension introuvable")
    return dim


async def _get_subdimension_or_404(db: AsyncSession, sub_id: int) -> SubDimension:
    sub = await db.scalar(
        select(SubDimension)
        .where(SubDimension.id == sub_id)
        .options(selectinload(SubDimension.questions))
    )
    if sub is None:
        raise HTTPException(status_code=404, detail="Sous-dimension introuvable")
    return sub


async def _get_question_or_404(db: AsyncSession, question_id: int) -> Question:
    question = await db.scalar(select(Question).where(Question.id == question_id))
    if question is None:
        raise HTTPException(status_code=404, detail="Question introuvable")
    return question


# ── Force-delete helpers ─────────────────────────────────────────────────────
# Answers and dimension-scores no longer block a delete: they key into the
# frozen snapshot of the version they were collected under (see
# app/services/questionnaire_reference.py), so deleting the live rows costs no
# history and they are deliberately left alone here. `force` now only reaches
# past the recommendation ladder, and the impact preview stays because an admin
# should still see how many past evaluations mentioned what they are removing.
# The rest is ORM cascade (Dimension → SubDimension → Question, and
# Question → Recommendation, both ON DELETE CASCADE already).

async def _question_ids_for_dimension(db: AsyncSession, dimension_id: int) -> list[int]:
    return list(
        (await db.execute(select(Question.id).where(Question.dimension_id == dimension_id)))
        .scalars()
        .all()
    )


async def _question_ids_for_subdimension(db: AsyncSession, sub_id: int) -> list[int]:
    return list(
        (await db.execute(select(Question.id).where(Question.sub_dimension_id == sub_id)))
        .scalars()
        .all()
    )


async def _delete_impact(
    db: AsyncSession, question_ids: list[int], dimension_ids: list[int] | None = None
) -> DeleteImpact:
    assessment_ids: set[int] = set()
    answer_count = 0
    if question_ids:
        rows = (
            await db.execute(select(Answer.assessment_id).where(Answer.question_id.in_(question_ids)))
        ).scalars().all()
        answer_count = len(rows)
        assessment_ids.update(rows)
    if dimension_ids:
        rows = (
            await db.execute(
                select(DimensionScore.assessment_id).where(DimensionScore.dimension_id.in_(dimension_ids))
            )
        ).scalars().all()
        assessment_ids.update(rows)
    recommendation_count = 0
    if question_ids:
        recommendation_count = await db.scalar(
            select(func.count()).select_from(Recommendation).where(Recommendation.question_id.in_(question_ids))
        ) or 0
    return DeleteImpact(
        answer_count=answer_count,
        assessment_count=len(assessment_ids),
        recommendation_count=recommendation_count,
    )


# ── Dimensions ────────────────────────────────────────────────────────────────


@router.get(
    "/dimensions",
    response_model=list[DimensionAdminRead],
    dependencies=[Depends(require_back_office)],
)
async def list_dimensions(db: AsyncSession = Depends(get_db)):
    """All dimensions (incl. inactive) with nested sub-dimensions and questions."""
    stmt = _dimension_query().order_by(Dimension.sort_order, Dimension.id)
    return (await db.execute(stmt)).scalars().all()


@router.get(
    "/dimensions/{dimension_id}",
    response_model=DimensionAdminRead,
    dependencies=[Depends(require_back_office)],
)
async def get_dimension(dimension_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_dimension_or_404(db, dimension_id)


@router.post(
    "/dimensions",
    response_model=DimensionAdminRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_dimension(
    payload: DimensionCreate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    count = await db.scalar(select(func.count()).select_from(Dimension)) or 0
    dim = Dimension(
        key=await _unique_key(db, _slugify(payload.name)),
        code=f"{count + 1:02d}",
        name=payload.name,
        short_name=payload.name[:100],
        description=payload.description or "",
        weight=payload.weight,
        color=payload.color,
        sort_order=payload.sort_order if payload.sort_order is not None else count,
        is_active=payload.is_active,
    )
    db.add(dim)
    await db.commit()
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Ajout dimension {dim.name}",
        entity_type="dimension",
        entity_id=dim.id,
        entity_label=dim.name,
        before=f"{count} dimensions",
        after=f"{count + 1} dimensions",
    )
    return await _get_dimension_or_404(db, dim.id)


@router.patch(
    "/dimensions/{dimension_id}",
    response_model=DimensionAdminRead,
    dependencies=[Depends(require_super_admin)],
)
async def update_dimension(
    dimension_id: int,
    payload: DimensionUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    dim = await _get_dimension_or_404(db, dimension_id)
    updates = payload.model_dump(exclude_unset=True)
    previous = {field: getattr(dim, field) for field in DIMENSION_FIELD_LABELS}
    for field, value in updates.items():
        setattr(dim, field, value)
    await db.commit()
    before, after, fields = summarize_changes(
        previous,
        {field: getattr(dim, field) for field in previous},
        DIMENSION_FIELD_LABELS,
    )
    if fields:
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Modification dimension {dim.name}",
            entity_type="dimension",
            entity_id=dim.id,
            entity_label=dim.name,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return await _get_dimension_or_404(db, dimension_id)


@router.get(
    "/dimensions/{dimension_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def dimension_delete_impact(dimension_id: int, db: AsyncSession = Depends(get_db)):
    """How much collected history refers to this dimension.

    Nothing here is destroyed by a delete any more — answers and scores are
    read from their version's snapshot — but an admin should still see how
    many past evaluations mentioned what they are about to remove.
    """
    await _get_dimension_or_404(db, dimension_id)
    question_ids = await _question_ids_for_dimension(db, dimension_id)
    return await _delete_impact(db, question_ids, dimension_ids=[dimension_id])


@router.delete(
    "/dimensions/{dimension_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_dimension(
    dimension_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    dim = await _get_dimension_or_404(db, dimension_id)
    name = dim.name
    await db.delete(dim)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # A blocked delete is worth recording too: it's an attempt to remove
        # something history still depends on.
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Suppression dimension {name}",
            status=STATUS_FAILURE,
            entity_type="dimension",
            entity_id=dimension_id,
            entity_label=name,
            before=name,
            after="Refusé — élément référencé",
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Suppression dimension {name}",
        entity_type="dimension",
        entity_id=dimension_id,
        entity_label=name,
        before=name,
        after="Supprimée",
    )


# ── Sub-dimensions ────────────────────────────────────────────────────────────


@router.post(
    "/subdimensions",
    response_model=SubDimensionAdminRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_subdimension(
    payload: SubDimensionCreate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    await _get_dimension_or_404(db, payload.dimension_id)
    count = await db.scalar(
        select(func.count())
        .select_from(SubDimension)
        .where(SubDimension.dimension_id == payload.dimension_id)
    ) or 0
    sub = SubDimension(
        dimension_id=payload.dimension_id,
        name=payload.name,
        sort_order=payload.sort_order if payload.sort_order is not None else count,
        is_active=payload.is_active,
    )
    db.add(sub)
    await db.commit()
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Ajout sous-dimension {sub.name}",
        entity_type="subdimension",
        entity_id=sub.id,
        entity_label=sub.name,
        after=sub.name,
    )
    return await _get_subdimension_or_404(db, sub.id)


@router.patch(
    "/subdimensions/{sub_id}",
    response_model=SubDimensionAdminRead,
    dependencies=[Depends(require_super_admin)],
)
async def update_subdimension(
    sub_id: int,
    payload: SubDimensionUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    sub = await _get_subdimension_or_404(db, sub_id)
    updates = payload.model_dump(exclude_unset=True)
    previous = {field: getattr(sub, field) for field in SUBDIMENSION_FIELD_LABELS}
    if "dimension_id" in updates:
        await _get_dimension_or_404(db, updates["dimension_id"])
        # keep the denormalized dimension_id on the moved questions consistent
        for q in sub.questions:
            q.dimension_id = updates["dimension_id"]
    for field, value in updates.items():
        setattr(sub, field, value)
    await db.commit()
    before, after, fields = summarize_changes(
        previous,
        {field: getattr(sub, field) for field in previous},
        SUBDIMENSION_FIELD_LABELS,
    )
    if fields:
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Modification sous-dimension {sub.name}",
            entity_type="subdimension",
            entity_id=sub.id,
            entity_label=sub.name,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return await _get_subdimension_or_404(db, sub_id)


@router.get(
    "/subdimensions/{sub_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def subdimension_delete_impact(sub_id: int, db: AsyncSession = Depends(get_db)):
    """How much collected history refers to this sub-dimension."""
    await _get_subdimension_or_404(db, sub_id)
    question_ids = await _question_ids_for_subdimension(db, sub_id)
    return await _delete_impact(db, question_ids)


@router.delete(
    "/subdimensions/{sub_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_subdimension(
    sub_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    sub = await _get_subdimension_or_404(db, sub_id)
    name = sub.name
    await db.delete(sub)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Suppression sous-dimension {name}",
            status=STATUS_FAILURE,
            entity_type="subdimension",
            entity_id=sub_id,
            entity_label=name,
            before=name,
            after="Refusé — élément référencé",
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Suppression sous-dimension {name}",
        entity_type="subdimension",
        entity_id=sub_id,
        entity_label=name,
        before=name,
        after="Supprimée",
    )


# ── Questions ─────────────────────────────────────────────────────────────────


@router.get(
    "/questions",
    response_model=list[QuestionAdminRead],
    dependencies=[Depends(require_back_office)],
)
async def list_questions(
    sub_dimension_id: int | None = None,
    dimension_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Question)
    if sub_dimension_id is not None:
        stmt = stmt.where(Question.sub_dimension_id == sub_dimension_id)
    if dimension_id is not None:
        stmt = stmt.where(Question.dimension_id == dimension_id)
    stmt = stmt.order_by(Question.sub_dimension_id, Question.sort_order, Question.id)
    return (await db.execute(stmt)).scalars().all()


@router.post(
    "/questions",
    response_model=QuestionAdminRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_question(
    payload: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    sub = await _get_subdimension_or_404(db, payload.sub_dimension_id)
    count = await db.scalar(
        select(func.count())
        .select_from(Question)
        .where(Question.sub_dimension_id == sub.id)
    ) or 0
    question = Question(
        dimension_id=sub.dimension_id,
        sub_dimension_id=sub.id,
        text=payload.text,
        description=payload.description,
        type=payload.type,
        weight=payload.weight,
        sort_order=payload.sort_order if payload.sort_order is not None else count,
        is_required=payload.is_required,
        level_responses=(
            [r.model_dump() for r in payload.level_responses]
            if payload.level_responses else None
        ),
        choice_options=(
            [o.model_dump() for o in payload.choice_options]
            if payload.choice_options else None
        ),
        is_active=payload.is_active,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Ajout question Q-{question.id:03d}",
        entity_type="question",
        entity_id=question.id,
        entity_label=question.text,
        after=question.text,
        details={"sous-dimension": sub.name, "type": question.type},
    )
    return question


@router.patch(
    "/questions/{question_id}",
    response_model=QuestionAdminRead,
    dependencies=[Depends(require_super_admin)],
)
async def update_question(
    question_id: int,
    payload: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    question = await _get_question_or_404(db, question_id)
    updates = payload.model_dump(exclude_unset=True)
    previous = {field: getattr(question, field) for field in QUESTION_FIELD_LABELS}
    if "sub_dimension_id" in updates and updates["sub_dimension_id"] is not None:
        target = await _get_subdimension_or_404(db, updates["sub_dimension_id"])
        question.dimension_id = target.dimension_id  # keep denormalized FK consistent
    for field, value in updates.items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    before, after, fields = summarize_changes(
        previous,
        {field: getattr(question, field) for field in previous},
        QUESTION_FIELD_LABELS,
    )
    if fields:
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Modification question Q-{question.id:03d}",
            entity_type="question",
            entity_id=question.id,
            entity_label=question.text,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return question


@router.get(
    "/questions/{question_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def question_delete_impact(question_id: int, db: AsyncSession = Depends(get_db)):
    """How much collected history refers to this question."""
    await _get_question_or_404(db, question_id)
    return await _delete_impact(db, [question_id])


@router.delete(
    "/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_question(
    question_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    question = await _get_question_or_404(db, question_id)
    label = question.text
    await db.delete(question)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        await audit.record(
            module=MODULE_FRAMEWORK,
            action=f"Suppression question Q-{question_id:03d}",
            status=STATUS_FAILURE,
            entity_type="question",
            entity_id=question_id,
            entity_label=label,
            before=label,
            after="Refusé — élément référencé",
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)
    await audit.record(
        module=MODULE_FRAMEWORK,
        action=f"Suppression question Q-{question_id:03d}",
        entity_type="question",
        entity_id=question_id,
        entity_label=label,
        before=label,
        after="Supprimée",
    )
