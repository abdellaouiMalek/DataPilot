"""Public read endpoints serving the reference data the frontend used to
hard-code (dimensions + questions, banks, departments, roles, maturity levels).

These are unauthenticated on purpose: the landing page is public, and the data
is non-sensitive. Admin-only write endpoints land in a later phase.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import get_db
from app.models import Bank, Department, Dimension, MaturityLevel, Question, Role
from app.schemas.config import DimensionRead, LookupRead, MaturityLevelRead

router = APIRouter(prefix="/api", tags=["config"])


async def _list_active(db: AsyncSession, model):
    """Active rows of a lookup model, ordered by sort_order."""
    stmt = (
        select(model)
        .where(model.is_active.is_(True))
        .order_by(model.sort_order, model.id)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/dimensions", response_model=list[DimensionRead])
async def list_dimensions(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(Dimension)
        .where(Dimension.is_active.is_(True))
        .order_by(Dimension.sort_order, Dimension.id)
        .options(
            selectinload(Dimension.questions.and_(Question.is_active.is_(True)))
        )
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/banks", response_model=list[LookupRead])
async def list_banks(db: AsyncSession = Depends(get_db)):
    return await _list_active(db, Bank)


@router.get("/departments", response_model=list[LookupRead])
async def list_departments(db: AsyncSession = Depends(get_db)):
    return await _list_active(db, Department)


@router.get("/roles", response_model=list[LookupRead])
async def list_roles(db: AsyncSession = Depends(get_db)):
    return await _list_active(db, Role)


@router.get("/maturity-levels", response_model=list[MaturityLevelRead])
async def list_maturity_levels(db: AsyncSession = Depends(get_db)):
    stmt = select(MaturityLevel).order_by(MaturityLevel.sort_order, MaturityLevel.id)
    result = await db.execute(stmt)
    return result.scalars().all()
