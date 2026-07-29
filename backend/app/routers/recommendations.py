"""Ranked, explained recommendations for a stored assessment.

Kept separate from ``assessments.py`` (which owns scoring/persistence of a
submission) since this is a distinct concern: it calls a trained model and
supports two selection scenarios. Shares the same ``/api/assessments``
prefix.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_bank_scope, verify_token
from app.db.database import get_db
from app.models import Assessment
from app.schemas.recommendation import (
    DimensionNoteOut,
    NarrativeOut,
    RecommendationOut,
    RecommendationPlanOut,
)
from app.services.recommendation_engine import (
    DimensionNotFoundError,
    RankedRecommendation,
    get_comparison_narrative,
    get_narrative,
    get_or_create_recommendation_plan,
    get_recommendations,
)


def _to_recommendation_out(item: RankedRecommendation) -> RecommendationOut:
    return RecommendationOut(
        rank=item.rank,
        score=item.score,
        code=item.recommendation.code,
        title=item.recommendation.title,
        recommendation_text=item.recommendation.recommendation_text,
        category=item.recommendation.category,
        regulatory_flag=item.recommendation.regulatory_flag,
        effort=item.recommendation.effort,
        question_id=item.recommendation.question_id,
        dimension_id=item.dimension_id,
        trigger_level=item.recommendation.trigger_level,
        target_level=item.recommendation.target_level,
        explanation_factors=item.explanation_factors,
        texte_reformule=item.texte_reformule,
        justification=item.justification,
    )

router = APIRouter(prefix="/api/assessments", tags=["recommendations"])


# Registered before the "/{assessment_id}/..." routes below: both share a
# 2-segment shape ("/x/narrative"), and since the path param isn't given an
# explicit ":int" converter, "/comparison/narrative" would otherwise match
# "/{assessment_id}/narrative" first (with "comparison" bound to
# assessment_id) and 422 on the int conversion instead of reaching this
# route -- route order is what disambiguates them.
@router.get(
    "/comparison/narrative",
    response_model=NarrativeOut,
)
async def read_comparison_narrative(
    initial_id: int = Query(...),
    current_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    """Un seul recit LLM qui analyse l'evolution entre deux assessments deja
    soumis (score global, niveaux, dimensions), au lieu de deux recits
    independants generes separement puis lus l'un a cote de l'autre."""
    stmt = (
        select(Assessment)
        .where(Assessment.id.in_((initial_id, current_id)))
        .options(selectinload(Assessment.dimension_scores))
    )
    by_id = {a.id: a for a in (await db.execute(stmt)).scalars().all()}
    initial = by_id.get(initial_id)
    current = by_id.get(current_id)

    # Same 404 for "doesn't exist" and "exists but belongs to another
    # bank" as read_narrative -- confirming the latter to an unauthorized
    # caller would leak that the id is real.
    if (
        initial is None
        or current is None
        or (bank_scope is not None and initial.bank_id != bank_scope)
        or (bank_scope is not None and current.bank_id != bank_scope)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assessment introuvable.",
        )

    narrative = await get_comparison_narrative(db, initial, current)
    return NarrativeOut(narrative=narrative)


@router.get(
    "/{assessment_id}/recommendations",
    response_model=RecommendationPlanOut,
)
async def read_recommendations(
    assessment_id: int,
    dimension_id: int | None = Query(default=None),
    target_level: int | None = Query(default=None, ge=2, le=5),
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    """Classe les recommandations candidates pour un assessment deja soumis
    et en tire un plan d'action prioritaire resserre.

    Sans parametres : Scenario 1, le plan automatique "+1 par dimension".
    Avec ``dimension_id`` ET ``target_level`` : Scenario 2, la cible
    personnalisee sur une dimension. Un seul des deux fourni est une erreur
    (ambigu : on ne sait pas quel scenario appliquer).
    """
    if (dimension_id is None) != (target_level is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="dimension_id et target_level sont requis ensemble.",
        )

    stmt = (
        select(Assessment)
        .where(Assessment.id == assessment_id)
        .options(selectinload(Assessment.answers))
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    # Same 404 for "doesn't exist" and "exists but belongs to another
    # bank" -- confirming the latter to an unauthorized caller would leak
    # that the id is real.
    if assessment is None or (
        bank_scope is not None and assessment.bank_id != bank_scope
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} introuvable.",
        )

    # Scenario 1 (the default plan, no params) is what the Recommendations
    # page always requests first -- it's persisted so revisiting it later
    # (e.g. from Historique, or after a server restart) never re-pays for
    # the LLM reformulation. Scenario 2 (a specific dimension_id/
    # target_level, chosen interactively) is parameterized per-request and
    # always computed fresh -- there's no single "the" plan for it to cache.
    if dimension_id is None and target_level is None:
        plan_dict = await get_or_create_recommendation_plan(db, assessment)
        return RecommendationPlanOut(**plan_dict)

    try:
        plan = await get_recommendations(
            db,
            assessment,
            dimension_id=dimension_id,
            target_level=target_level,
        )
    except DimensionNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dimension {dimension_id} introuvable ou inactive.",
        )

    return RecommendationPlanOut(
        plan_prioritaire=[
            _to_recommendation_out(item) for item in plan.priority_plan
        ],
        recommandations_completes=[
            _to_recommendation_out(item) for item in plan.all_recommendations
        ],
        notes_dimensions=[
            DimensionNoteOut(
                dimension_id=note.dimension_id,
                dimension_name=note.dimension_name,
                dimension_score=note.dimension_score,
                message=note.message,
            )
            for note in plan.dimension_notes
        ],
    )


@router.get(
    "/{assessment_id}/narrative",
    response_model=NarrativeOut,
)
async def read_narrative(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    """Plain-language narrative of an already-submitted assessment's scores."""
    stmt = (
        select(Assessment)
        .where(Assessment.id == assessment_id)
        .options(selectinload(Assessment.dimension_scores))
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None or (
        bank_scope is not None and assessment.bank_id != bank_scope
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} introuvable.",
        )

    narrative = await get_narrative(db, assessment)
    return NarrativeOut(narrative=narrative)
