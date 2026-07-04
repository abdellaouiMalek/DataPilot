"""Questionnaire submission + scoring endpoint.

A submission carries raw Likert answers. We validate them against the *active*
questionnaire, compute the maturity scores (``app.services.scoring``), then
persist the raw answers alongside the cached scores in a single transaction —
raw answers keep results reproducible if questions change later; cached scores
let the results page load without recomputing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_token
from app.db.database import get_db
from app.models import (
    Answer,
    Assessment,
    Dimension,
    DimensionScore,
    MaturityLevel,
    Question,
)
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentResult,
    DimensionScoreRead,
)
from app.services.scoring import (
    DimensionInput,
    MaturityBand,
    QuestionInput,
    compute_scores,
)

router = APIRouter(prefix="/api/assessments", tags=["assessments"])


@router.post("", response_model=AssessmentResult, status_code=status.HTTP_201_CREATED)
async def submit_assessment(
    payload: AssessmentCreate,
    db: AsyncSession = Depends(get_db),
    _claims: dict = Depends(verify_token),
):
    """Score a submitted questionnaire and store it."""
    # ── Load the active reference data the score is computed against ──────────
    questions = (
        await db.execute(select(Question).where(Question.is_active.is_(True)))
    ).scalars().all()
    dimensions = (
        await db.execute(select(Dimension).where(Dimension.is_active.is_(True)))
    ).scalars().all()
    levels = (await db.execute(select(MaturityLevel))).scalars().all()

    question_by_id = {q.id: q for q in questions}
    active_dim_ids = {d.id for d in dimensions}

    # ── Validate the submission ───────────────────────────────────────────────
    # Reject duplicate answers and answers to unknown/inactive questions rather
    # than silently dropping them — a malformed payload should be a clear 400.
    seen: set[int] = set()
    scoring_inputs: list[QuestionInput] = []
    for ans in payload.answers:
        q = question_by_id.get(ans.question_id)
        if q is None or q.dimension_id not in active_dim_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Question {ans.question_id} is unknown or inactive.",
            )
        if ans.question_id in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate answer for question {ans.question_id}.",
            )
        seen.add(ans.question_id)
        scoring_inputs.append(
            QuestionInput(
                question_id=q.id,
                dimension_id=q.dimension_id,
                weight=q.weight,
                value=ans.value,
            )
        )

    # ── Compute (pure) ────────────────────────────────────────────────────────
    result = compute_scores(
        questions=scoring_inputs,
        dimensions=[DimensionInput(d.id, d.weight) for d in dimensions],
        bands=[
            MaturityBand(lv.label, lv.min_score, lv.max_score) for lv in levels
        ],
    )

    # ── Persist raw answers + cached scores in one transaction ────────────────
    assessment = Assessment(
        bank=payload.bank,
        department=payload.department,
        evaluator_role=payload.evaluator_role,
        score_global=result.global_score,
        maturity_label=result.maturity_label,
        answers=[
            Answer(question_id=a.question_id, value=a.value) for a in payload.answers
        ],
        dimension_scores=[
            DimensionScore(dimension_id=dim_id, score=score)
            for dim_id, score in result.dimension_scores.items()
        ],
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    # ── Shape the response (enrich dimension scores with key/name) ────────────
    dim_by_id = {d.id: d for d in dimensions}
    dimension_scores = [
        DimensionScoreRead(
            dimension_id=dim_id,
            key=dim_by_id[dim_id].key,
            name=dim_by_id[dim_id].name,
            score=score,
        )
        for dim_id, score in result.dimension_scores.items()
    ]

    return AssessmentResult(
        id=assessment.id,
        bank=assessment.bank,
        department=assessment.department,
        evaluator_role=assessment.evaluator_role,
        score_global=assessment.score_global,
        maturity_label=assessment.maturity_label,
        created_at=assessment.created_at,
        dimension_scores=dimension_scores,
    )
