"""Admin "Veille réglementaire" endpoints: import a circular (file or URL),
review its AI-extracted impacts, and publish once every impact has been
triaged. Admin-only, like admin.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_admin
from app.db.database import get_db
from app.models import RegulatoryCircular, RegulatoryImpact
from app.schemas.regulatory import CircularDetailRead, CircularRead, ImpactRead, ImpactUpdate
from app.services.regulatory import analyze_source

router = APIRouter(
    prefix="/api/admin/regulatory",
    tags=["regulatory"],
    dependencies=[Depends(require_admin)],
)

_VALID_ACTIONS = {"accepté", "modifié", "rejeté"}


def _circular_query():
    return select(RegulatoryCircular).options(
        selectinload(RegulatoryCircular.impacts)
    )


async def _get_circular_or_404(db: AsyncSession, circular_id: int) -> RegulatoryCircular:
    circular = await db.scalar(
        _circular_query().where(RegulatoryCircular.id == circular_id)
    )
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Circulaire introuvable.")
    return circular


async def _get_impact_or_404(db: AsyncSession, impact_id: int) -> RegulatoryImpact:
    impact = await db.get(RegulatoryImpact, impact_id)
    if impact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Impact introuvable.")
    return impact


@router.get("/circulars", response_model=list[CircularRead])
async def list_circulars(db: AsyncSession = Depends(get_db)):
    stmt = _circular_query().order_by(RegulatoryCircular.created_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.get("/circulars/{circular_id}", response_model=CircularDetailRead)
async def get_circular(circular_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_circular_or_404(db, circular_id)


@router.post(
    "/circulars/import",
    response_model=CircularDetailRead,
    status_code=status.HTTP_201_CREATED,
)
async def import_circular(
    file: UploadFile | None = File(default=None),
    url: str | None = Form(default=None),
    db: AsyncSession = Depends(get_db),
):
    if not file and not url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Fournissez un fichier ou une URL."
        )

    file_bytes = await file.read() if file else None
    analyzed = await analyze_source(
        file_bytes=file_bytes,
        filename=file.filename if file else None,
        url=url or None,
    )

    circular = RegulatoryCircular(
        reference=analyzed["reference"],
        publication_date=analyzed["publication_date"],
        theme=analyzed["theme"],
        status="Brouillon",
        version="Brouillon",
        source_filename=analyzed["source_filename"],
        source_url=analyzed["source_url"],
        raw_text=analyzed["raw_text"],
        is_published=False,
        impacts=[
            RegulatoryImpact(
                requirement_text=i["requirement_text"],
                target_type=i["target_type"],
                target_description=i["target_description"],
            )
            for i in analyzed["impacts"]
        ],
    )
    db.add(circular)
    await db.commit()
    return await _get_circular_or_404(db, circular.id)


@router.patch("/impacts/{impact_id}", response_model=ImpactRead)
async def update_impact(
    impact_id: int, payload: ImpactUpdate, db: AsyncSession = Depends(get_db)
):
    impact = await _get_impact_or_404(db, impact_id)
    if payload.action is not None and payload.action not in _VALID_ACTIONS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"action doit être l'une de {sorted(_VALID_ACTIONS)} ou null.",
        )
    impact.action = payload.action
    impact.edited_text = payload.edited_text if payload.action == "modifié" else None
    await db.commit()
    await db.refresh(impact)
    return impact


@router.post("/circulars/{circular_id}/publish", response_model=CircularRead)
async def publish_circular(circular_id: int, db: AsyncSession = Depends(get_db)):
    circular = await _get_circular_or_404(db, circular_id)
    if circular.is_published:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cette circulaire est déjà publiée."
        )
    if not circular.impacts:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Aucun impact à publier pour cette circulaire.",
        )
    pending = [i for i in circular.impacts if i.action is None]
    if pending:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{len(pending)} exigence(s) en attente de validation.",
        )

    published_count = await db.scalar(
        select(func.count())
        .select_from(RegulatoryCircular)
        .where(RegulatoryCircular.is_published.is_(True))
    ) or 0

    circular.is_published = True
    circular.status = "En vigueur"
    circular.version = f"v{published_count + 1}"
    circular.published_at = func.now()
    await db.commit()
    await db.refresh(circular)
    return circular
