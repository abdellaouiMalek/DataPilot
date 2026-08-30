"""Read-only "questionnaire versions" history: every PUBLISHED "Veille
réglementaire" circular is one version. Deliberately separate from
``app.routers.regulatory`` (super-admin only, covers the full in-review
workflow including unpublished/sensitive circulars) : this router only
ever exposes circulars that are already published, and is readable by
both ``admin`` and ``super_admin`` (``require_back_office``) -- an
``admin``-role user is notified when a new version publishes (see
``app.services.notifications``) and must be able to consult it, without
gaining any access to the unpublished review workflow itself.

Reuses ``CircularRead``/``CircularDetailRead``/``ImpactRead`` from
``app.schemas.regulatory`` as-is (same underlying data) rather than
duplicating schemas for what is really the same circular, just filtered
to "published" and read through a more permissive role gate.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_back_office
from app.db.database import get_db
from app.models import RegulatoryCircular
from app.schemas.regulatory import CircularDetailRead, CircularRead

router = APIRouter(
    prefix="/api/versions",
    tags=["versions"],
    dependencies=[Depends(require_back_office)],
)


def _published_query():
    return (
        select(RegulatoryCircular)
        .options(selectinload(RegulatoryCircular.impacts))
        .where(RegulatoryCircular.is_published.is_(True))
    )


@router.get("", response_model=list[CircularRead])
async def list_versions(db: AsyncSession = Depends(get_db)):
    """Toutes les versions publiées, la plus récente d'abord."""
    stmt = _published_query().order_by(RegulatoryCircular.published_at.desc())
    return (await db.execute(stmt)).scalars().all()


@router.get("/{circular_id}", response_model=CircularDetailRead)
async def get_version(circular_id: int, db: AsyncSession = Depends(get_db)):
    """Détail d'une version publiée, avec les impacts appliqués (voir
    ``app.services.regulatory.apply_impacts_to_catalog``). 404 si la
    circulaire n'existe pas OU n'est pas publiée -- ce dernier cas
    délibérément : une circulaire encore en revue ne doit jamais être
    visible via cette route accessible aux ``admin``, même en devinant
    son id."""
    circular = await db.scalar(
        _published_query().where(RegulatoryCircular.id == circular_id)
    )
    if circular is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version introuvable.")
    return circular
