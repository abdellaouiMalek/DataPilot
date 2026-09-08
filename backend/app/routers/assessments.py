"""Questionnaire submission + scoring endpoint.

A submission carries raw Likert answers. We validate them against the *active*
questionnaire, compute the maturity scores (``app.services.scoring``), then
persist the raw answers alongside the cached scores in a single transaction, 
raw answers keep results reproducible if questions change later; cached scores
let the results page load without recomputing.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_bank_scope, verify_token
from app.db.database import get_db
from app.models import (
    Answer,
    Assessment,
    Bank,
    Dimension,
    DimensionScore,
    MaturityLevel,
    Question,
    QuestionnaireVersion,
)
from app.models.audit_log import MODULE_ASSESSMENTS
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentResult,
    DimensionScoreRead,
)
from app.services.notifications import notify_assessment_submitted
from app.services.audit import Audit, audit_context
from app.services.recommendation_engine import (
    prewarm_narrative,
    prewarm_recommendations,
)
from app.services.questionnaire_reference import QuestionnaireRef, references_for
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
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
    audit: Audit = Depends(audit_context),
):
    """Score a submitted questionnaire and store it."""
    if bank_scope is not None and payload.bank_id != bank_scope:
        raise HTTPException(
            status_code=403,
            detail="Vous ne pouvez soumettre une evaluation que pour "
            "votre propre banque.",
        )

    bank = await db.get(Bank, payload.bank_id)
    if bank is None:
        raise HTTPException(status_code=400, detail="Banque inconnue.")

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
    # than silently dropping them, a malformed payload should be a clear 400.
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
    # Record which published snapshot this submission was answered against:
    # the answers below are keyed to it, not to the live `questions` rows, so
    # this stamp is what makes the assessment readable after the framework
    # moves on. None until the framework has been published at least once.
    #
    # The *active* version, never `max(number)`: restoring an older version
    # moves the live questionnaire back to it, and stamping the newest would
    # tie the submission to a snapshot the respondent was never shown.
    live_version = (
        await db.execute(
            select(QuestionnaireVersion).where(QuestionnaireVersion.is_active.is_(True))
        )
    ).scalars().first()
    if live_version is None:
        live_version = (
            await db.execute(
                select(QuestionnaireVersion)
                .order_by(QuestionnaireVersion.number.desc())
                .limit(1)
            )
        ).scalars().first()

    assessment = Assessment(
        bank_id=payload.bank_id,
        department=payload.department,
        evaluator_role=payload.evaluator_role,
        keycloak_sub=claims.get("sub"),
        version_id=live_version.id if live_version else None,
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

    # Start reformulating the default recommendation plan and the results
    # narrative now, in the background, so that slow LLM work is already
    # done (and persisted) by the time the user reaches Results or
    # Recommendations, instead of them waiting for it there.
    background_tasks.add_task(prewarm_recommendations, assessment.id)
    background_tasks.add_task(prewarm_narrative, assessment.id)

    # Respondent-side action, but it belongs in the same trail: it's what the
    # back-office is looking at when it asks who submitted what, and when.
    await audit.record(
        module=MODULE_ASSESSMENTS,
        action=f"Soumission évaluation, {bank.name}",
        entity_type="assessment",
        entity_id=assessment.id,
        entity_label=bank.name,
        after=(
            f"Score {result.global_score:.1f}/5 · {result.maturity_label or '-'}"
            if result.global_score is not None
            else "Évaluation enregistrée"
        ),
        details={
            "questionnaire": f"v{live_version.number}" if live_version else None,
            "departement": assessment.department,
            "reponses": len(payload.answers),
        },
    )

    # The one notification the back-office cannot see coming: submissions are
    # made by respondents, so nothing else tells an administrator it happened.
    background_tasks.add_task(
        notify_assessment_submitted,
        bank=bank.name,
        score=result.global_score,
        maturity=result.maturity_label,
        department=assessment.department,
        actor_email=claims.get("email"),
    )

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
        bank_id=assessment.bank_id,
        bank=bank.name,
        bank_logo_url=bank.logo_url,
        department=assessment.department,
        evaluator_role=assessment.evaluator_role,
        score_global=assessment.score_global,
        maturity_label=assessment.maturity_label,
        created_at=assessment.created_at,
        version_id=assessment.version_id,
        version_number=live_version.number if live_version else None,
        dimension_scores=dimension_scores,
        submitted_by_me=True,
    )


def _to_result(
    assessment: Assessment,
    reference: QuestionnaireRef,
    version_number: int | None,
    sub: str | None,
) -> AssessmentResult:
    """Une evaluation stockee, nommee contre le questionnaire repondu.

    Les dimensions viennent du snapshot de version et non des tables vivantes :
    une dimension supprimee depuis disparaitrait sinon des scores d'une
    ancienne evaluation.
    """
    return AssessmentResult(
        id=assessment.id,
        bank_id=assessment.bank_id,
        bank=assessment.bank.name,
        bank_logo_url=assessment.bank.logo_url,
        department=assessment.department,
        evaluator_role=assessment.evaluator_role,
        score_global=assessment.score_global,
        maturity_label=assessment.maturity_label,
        created_at=assessment.created_at,
        version_id=assessment.version_id,
        version_number=version_number,
        dimension_scores=[
            DimensionScoreRead(
                dimension_id=ds.dimension_id,
                key=reference.dimensions[ds.dimension_id].key,
                name=reference.dimensions[ds.dimension_id].name,
                score=ds.score,
            )
            for ds in assessment.dimension_scores
            if ds.dimension_id in reference.dimensions
        ],
        submitted_by_me=(assessment.keycloak_sub == sub),
    )


@router.get("/me", response_model=list[AssessmentResult])
async def list_my_assessments(
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    """History: every assessment for the caller's bank -- not just their
    own submissions, so colleagues at the same bank see each other's
    evaluations too. Admins (``bank_scope is None``) see every bank's.

    Each row's ``submitted_by_me`` says whether the caller is the one who
    actually submitted it, since this is no longer a purely personal list.
    """
    sub = claims.get("sub")
    stmt = (
        select(Assessment)
        .options(
            selectinload(Assessment.bank),
            selectinload(Assessment.dimension_scores),
        )
        .order_by(Assessment.created_at.desc())
    )
    if bank_scope is not None:
        stmt = stmt.where(Assessment.bank_id == bank_scope)
    assessments = (await db.execute(stmt)).scalars().all()
    if not assessments:
        return []

    # Each row is named against the questionnaire it was answered on: two
    # assessments in this list can sit on different versions, and a dimension
    # dropped since would otherwise vanish from the older one's scores.
    references = await references_for(db, assessments)
    version_numbers = {
        v.id: v.number
        for v in (await db.execute(select(QuestionnaireVersion))).scalars().all()
    }

    return [
        _to_result(a, references[a.id], version_numbers.get(a.version_id), sub)
        for a in assessments
    ]


@router.get("/{assessment_id}", response_model=AssessmentResult)
async def read_assessment(
    assessment_id: int,
    db: AsyncSession = Depends(get_db),
    claims: dict = Depends(verify_token),
    bank_scope: int | None = Depends(get_bank_scope),
):
    """One assessment, by id.

    Exists so the results / recommendations pages can be reached
    by URL and rebuilt from it. Previously they were handed the whole object
    through the router's in-memory state, which a page reload throws away --
    and which a login redirect through Keycloak throws away too.

    Same 404 for "unknown id" and "belongs to another bank" as the other
    read endpoints: confirming the difference would leak that the id exists.
    """
    stmt = (
        select(Assessment)
        .where(Assessment.id == assessment_id)
        .options(
            selectinload(Assessment.bank),
            selectinload(Assessment.dimension_scores),
        )
    )
    assessment = (await db.execute(stmt)).scalar_one_or_none()
    if assessment is None or (
        bank_scope is not None and assessment.bank_id != bank_scope
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assessment {assessment_id} introuvable.",
        )

    references = await references_for(db, [assessment])
    version_number = await db.scalar(
        select(QuestionnaireVersion.number).where(
            QuestionnaireVersion.id == assessment.version_id
        )
    )
    return _to_result(
        assessment, references[assessment.id], version_number, claims.get("sub")
    )
