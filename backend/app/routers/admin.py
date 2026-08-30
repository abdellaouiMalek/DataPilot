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
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy import update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_back_office, require_super_admin
from app.db.database import get_db
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

router = APIRouter(
    prefix="/api/super-admin",
    tags=["super-admin"],
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


# ── Force-delete helpers ─────────────────────────────────────────────────────
# Answers/dimension-scores are RESTRICT-protected against ordinary deletes (see
# app/models/assessment.py) so admins don't accidentally corrupt historical
# evaluations. A force-delete opts into that: it removes the blocking rows
# itself before the entity, then relies on ORM cascade for the rest
# (Dimension → SubDimension → Question, and Question → Recommendation, which
# are all ON DELETE CASCADE already).

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


async def _delete_answers_for_questions(db: AsyncSession, question_ids: list[int]) -> None:
    if question_ids:
        await db.execute(sa_delete(Answer).where(Answer.question_id.in_(question_ids)))


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


@router.patch(
    "/dimensions/{dimension_id}",
    response_model=DimensionAdminRead,
    dependencies=[Depends(require_super_admin)],
)
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


@router.get(
    "/dimensions/{dimension_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def dimension_delete_impact(dimension_id: int, db: AsyncSession = Depends(get_db)):
    """Preview what a force-delete of this dimension would wipe out."""
    await _get_dimension_or_404(db, dimension_id)
    question_ids = await _question_ids_for_dimension(db, dimension_id)
    return await _delete_impact(db, question_ids, dimension_ids=[dimension_id])


@router.delete(
    "/dimensions/{dimension_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_dimension(
    dimension_id: int, force: bool = False, db: AsyncSession = Depends(get_db)
):
    dim = await _get_dimension_or_404(db, dimension_id)
    if force:
        question_ids = await _question_ids_for_dimension(db, dimension_id)
        await _delete_answers_for_questions(db, question_ids)
        await db.execute(
            sa_delete(DimensionScore).where(DimensionScore.dimension_id == dimension_id)
        )
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
    dependencies=[Depends(require_super_admin)],
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


@router.patch(
    "/subdimensions/{sub_id}",
    response_model=SubDimensionAdminRead,
    dependencies=[Depends(require_super_admin)],
)
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


@router.get(
    "/subdimensions/{sub_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def subdimension_delete_impact(sub_id: int, db: AsyncSession = Depends(get_db)):
    """Preview what a force-delete of this sub-dimension would wipe out."""
    await _get_subdimension_or_404(db, sub_id)
    question_ids = await _question_ids_for_subdimension(db, sub_id)
    return await _delete_impact(db, question_ids)


@router.delete(
    "/subdimensions/{sub_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_subdimension(
    sub_id: int, force: bool = False, db: AsyncSession = Depends(get_db)
):
    sub = await _get_subdimension_or_404(db, sub_id)
    if force:
        question_ids = await _question_ids_for_subdimension(db, sub_id)
        await _delete_answers_for_questions(db, question_ids)
    await db.delete(sub)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)


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


@router.get(
    "/questions/{question_id}/impact",
    response_model=DeleteImpact,
    dependencies=[Depends(require_super_admin)],
)
async def question_delete_impact(question_id: int, db: AsyncSession = Depends(get_db)):
    """Preview what a force-delete of this question would wipe out."""
    await _get_question_or_404(db, question_id)
    return await _delete_impact(db, [question_id])


@router.delete(
    "/questions/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_question(
    question_id: int, force: bool = False, db: AsyncSession = Depends(get_db)
):
    question = await _get_question_or_404(db, question_id)
    if force:
        await _delete_answers_for_questions(db, [question_id])
    await db.delete(question)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=REFERENCED_409)


# ── Recommendations ──────────────────────────────────────────────────────────
# One row per (question_id, trigger_level) -- see uq_question_trigger on the
# model. A wizard step that targets several trigger levels at once submits a
# single POST with several trigger_levels; the endpoint creates one row per
# level not already occupied for that question, and reports the rest as
# skipped rather than failing the whole request over one conflict.


async def _get_recommendation_or_404(db: AsyncSession, recommendation_id: int) -> Recommendation:
    reco = await db.scalar(select(Recommendation).where(Recommendation.id == recommendation_id))
    if reco is None:
        raise HTTPException(status_code=404, detail="Recommandation introuvable")
    return reco


@router.get(
    "/recommendations",
    response_model=list[RecommendationAdminRead],
    dependencies=[Depends(require_super_admin)],
)
async def list_recommendations(db: AsyncSession = Depends(get_db)):
    stmt = select(Recommendation).order_by(Recommendation.question_id, Recommendation.trigger_level)
    return (await db.execute(stmt)).scalars().all()


@router.post(
    "/recommendations",
    response_model=RecommendationBatchCreateResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_super_admin)],
)
async def create_recommendations(
    payload: RecommendationCreate, db: AsyncSession = Depends(get_db)
):
    question = await _get_question_or_404(db, payload.question_id)
    dimension = await _get_dimension_or_404(db, question.dimension_id)

    requested = sorted(set(payload.trigger_levels))
    invalid = [lvl for lvl in requested if lvl < 1 or lvl > 4]
    if invalid:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Niveau(x) déclencheur(s) invalide(s) : {invalid} (doit être entre 1 et 4).",
        )

    existing_levels = set(
        (
            await db.execute(
                select(Recommendation.trigger_level).where(
                    Recommendation.question_id == question.id
                )
            )
        )
        .scalars()
        .all()
    )
    to_create = [lvl for lvl in requested if lvl not in existing_levels]
    skipped = [lvl for lvl in requested if lvl in existing_levels]

    if not to_create:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Une recommandation existe déjà pour tous les niveaux sélectionnés sur cette question.",
        )

    created: list[Recommendation] = []
    for lvl in to_create:
        reco = Recommendation(
            code=f"{dimension.code}Q{question.id}-{lvl}",
            question_id=question.id,
            trigger_level=lvl,
            target_level=lvl + 1,
            title=payload.title,
            recommendation_text=payload.recommendation_text,
            category=payload.category,
            regulatory_flag=payload.regulatory_flag,
            effort=payload.effort,
            is_active=payload.is_active,
        )
        db.add(reco)
        created.append(reco)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Conflit lors de la création (code ou niveau déjà utilisé).",
        )
    for reco in created:
        await db.refresh(reco)

    return RecommendationBatchCreateResult(created=created, skipped_levels=skipped)


@router.patch(
    "/recommendations/{recommendation_id}",
    response_model=RecommendationAdminRead,
    dependencies=[Depends(require_super_admin)],
)
async def update_recommendation(
    recommendation_id: int,
    payload: RecommendationUpdate,
    db: AsyncSession = Depends(get_db),
):
    reco = await _get_recommendation_or_404(db, recommendation_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(reco, field, value)
    await db.commit()
    await db.refresh(reco)
    return reco


@router.delete(
    "/recommendations/{recommendation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_super_admin)],
)
async def delete_recommendation(
    recommendation_id: int, db: AsyncSession = Depends(get_db)
):
    reco = await _get_recommendation_or_404(db, recommendation_id)
    # prerequisite_id is a nullable self-FK with no ON DELETE behavior
    # declared (Postgres defaults to RESTRICT) -- clear anything pointing at
    # this row first so deleting it never 409s over that alone. Nothing else
    # references recommendations.id (delivery to an assessment is computed
    # live by the recommendation engine, never persisted as a hard FK -- see
    # AssessmentRecommendationPlan, a JSON cache keyed by assessment_id only).
    await db.execute(
        sa_update(Recommendation)
        .where(Recommendation.prerequisite_id == recommendation_id)
        .values(prerequisite_id=None)
    )
    await db.delete(reco)
    await db.commit()
