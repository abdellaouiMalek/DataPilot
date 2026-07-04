"""Admin back-office endpoints — CRUD over the framework (Dimension →
Sub-dimension → Question) plus their attributes (weight, color, type).

Every route requires the realm ``admin`` role (enforced at the router level).
"""

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_admin
from app.db.database import get_db
from app.models import Dimension, Question, SubDimension
from app.schemas.admin import (
    DimensionAdminRead,
    DimensionCreate,
    DimensionUpdate,
    QuestionAdminRead,
    QuestionCreate,
    QuestionUpdate,
    SubDimensionAdminRead,
    SubDimensionCreate,
    SubDimensionUpdate,
)

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

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


# ── Dimensions ────────────────────────────────────────────────────────────────


@router.get("/dimensions", response_model=list[DimensionAdminRead])
async def list_dimensions(db: AsyncSession = Depends(get_db)):
    """All dimensions (incl. inactive) with nested sub-dimensions and questions."""
    stmt = _dimension_query().order_by(Dimension.sort_order, Dimension.id)
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
    return await _get_dimension_or_404(db, dim.id)


@router.patch("/dimensions/{dimension_id}", response_model=DimensionAdminRead)
async def update_dimension(
    dimension_id: int,
    payload: DimensionUpdate,
    db: AsyncSession = Depends(get_db),
):
    dim = await _get_dimension_or_404(db, dimension_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dim, field, value)
    await db.commit()
    return await _get_dimension_or_404(db, dimension_id)


@router.delete("/dimensions/{dimension_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dimension(dimension_id: int, db: AsyncSession = Depends(get_db)):
    dim = await _get_dimension_or_404(db, dimension_id)
    await db.delete(dim)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)


# ── Sub-dimensions ────────────────────────────────────────────────────────────


@router.post(
    "/subdimensions",
    response_model=SubDimensionAdminRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_subdimension(
    payload: SubDimensionCreate, db: AsyncSession = Depends(get_db)
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
    return await _get_subdimension_or_404(db, sub.id)


@router.patch("/subdimensions/{sub_id}", response_model=SubDimensionAdminRead)
async def update_subdimension(
    sub_id: int,
    payload: SubDimensionUpdate,
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_subdimension_or_404(db, sub_id)
    updates = payload.model_dump(exclude_unset=True)
    if "dimension_id" in updates:
        await _get_dimension_or_404(db, updates["dimension_id"])
        # keep the denormalized dimension_id on the moved questions consistent
        for q in sub.questions:
            q.dimension_id = updates["dimension_id"]
    for field, value in updates.items():
        setattr(sub, field, value)
    await db.commit()
    return await _get_subdimension_or_404(db, sub_id)


@router.delete("/subdimensions/{sub_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subdimension(sub_id: int, db: AsyncSession = Depends(get_db)):
    sub = await _get_subdimension_or_404(db, sub_id)
    await db.delete(sub)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)


# ── Questions ─────────────────────────────────────────────────────────────────


@router.get("/questions", response_model=list[QuestionAdminRead])
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
)
async def create_question(payload: QuestionCreate, db: AsyncSession = Depends(get_db)):
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
        type=payload.type,
        weight=payload.weight,
        sort_order=payload.sort_order if payload.sort_order is not None else count,
        is_active=payload.is_active,
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


@router.patch("/questions/{question_id}", response_model=QuestionAdminRead)
async def update_question(
    question_id: int,
    payload: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
):
    question = await _get_question_or_404(db, question_id)
    updates = payload.model_dump(exclude_unset=True)
    if "sub_dimension_id" in updates and updates["sub_dimension_id"] is not None:
        target = await _get_subdimension_or_404(db, updates["sub_dimension_id"])
        question.dimension_id = target.dimension_id  # keep denormalized FK consistent
    for field, value in updates.items():
        setattr(question, field, value)
    await db.commit()
    await db.refresh(question)
    return question


@router.delete("/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(question_id: int, db: AsyncSession = Depends(get_db)):
    question = await _get_question_or_404(db, question_id)
    await db.delete(question)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)
