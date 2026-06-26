"""Admin back-office endpoints (CRUD over the editable reference data).

Every route requires the realm ``admin`` role (enforced at the router level).
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_admin
from app.db.database import get_db
from app.models import Dimension
from app.schemas.admin import DimensionAdminRead, DimensionCreate, DimensionUpdate

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


async def _get_dimension_or_404(db: AsyncSession, dimension_id: int) -> Dimension:
    stmt = (
        select(Dimension)
        .where(Dimension.id == dimension_id)
        .options(selectinload(Dimension.questions))
    )
    dimension = (await db.execute(stmt)).scalar_one_or_none()
    if dimension is None:
        raise HTTPException(status_code=404, detail="Dimension introuvable")
    return dimension


# ── Dimensions ──────────────────────────────────────────────────────────────


@router.get("/dimensions", response_model=list[DimensionAdminRead])
async def list_dimensions(db: AsyncSession = Depends(get_db)):
    """All dimensions (incl. inactive), ordered, with all their questions."""
    stmt = (
        select(Dimension)
        .order_by(Dimension.sort_order, Dimension.id)
        .options(selectinload(Dimension.questions))
    )
    return (await db.execute(stmt)).scalars().all()


@router.get("/dimensions/{dimension_id}", response_model=DimensionAdminRead)
async def get_dimension(dimension_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_dimension_or_404(db, dimension_id)


@router.post(
    "/dimensions",
    response_model=DimensionAdminRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_dimension(payload: DimensionCreate, db: AsyncSession = Depends(get_db)):
    dimension = Dimension(**payload.model_dump())
    db.add(dimension)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Une dimension avec la clé '{payload.key}' existe déjà",
        )
    return await _get_dimension_or_404(db, dimension.id)


@router.patch("/dimensions/{dimension_id}", response_model=DimensionAdminRead)
async def update_dimension(
    dimension_id: int,
    payload: DimensionUpdate,
    db: AsyncSession = Depends(get_db),
):
    dimension = await _get_dimension_or_404(db, dimension_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dimension, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette clé de dimension est déjà utilisée",
        )
    return await _get_dimension_or_404(db, dimension_id)


@router.delete("/dimensions/{dimension_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dimension(dimension_id: int, db: AsyncSession = Depends(get_db)):
    dimension = await _get_dimension_or_404(db, dimension_id)
    await db.delete(dimension)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cette dimension est référencée par des évaluations existantes. "
                "Désactivez-la (is_active=false) au lieu de la supprimer."
            ),
        )
