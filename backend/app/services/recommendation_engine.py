"""Orchestrates ranked, explained recommendations for a stored assessment.

Ties together the pieces that already exist separately: live reference data
from the DB, ``scoring.py``'s selection scenarios, ``features.py``'s feature
builder, ``ranking.py``'s trained model, and ``explain.py``'s SHAP factors.
Nothing here reimplements any of that logic -- this module only loads data
and calls the existing functions in the right order.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.database import AsyncSessionLocal
from app.models import (
    Assessment,
    AssessmentRecommendationPlan,
    Dimension,
    Question,
    Recommendation,
)
from app.services import explain, ranking
from app.services.action_plan import (
    DimensionNote,
    RankedCandidate,
    build_priority_plan,
)
from app.services.features import CATEGORY_ORDER, build_features
from app.services.scoring import (
    DimensionInput,
    QuestionInput,
    compute_scores,
    select_recommendations_custom_target,
    select_recommendations_dimension_plus_one,
)
from llm.generation import (
    explain_comparison,
    explain_results,
    fallback_reformulation,
    reformulate_recommendation,
)

logger = logging.getLogger(__name__)

_CATEGORY_ID_MAP = {cat: i for i, cat in enumerate(CATEGORY_ORDER)}


class DimensionNotFoundError(Exception):
    """Raised when a requested dimension_id isn't an active dimension."""


@dataclass(frozen=True)
class ReferenceData:
    catalog: dict[tuple[int, int], Recommendation]
    dim_weight: dict[int, float]
    question_dimensions: dict[int, int]
    question_weights: dict[int, float]
    intra_weight: dict[int, float]
    dimension_names: dict[int, str]


@dataclass(frozen=True)
class RankedRecommendation:
    rank: int
    score: float
    recommendation: Recommendation
    dimension_id: int
    explanation_factors: list[dict]
    texte_reformule: str
    justification: str


@dataclass(frozen=True)
class RecommendationPlan:
    """Sortie complete du scenario 1/2 : le plan resserre (a afficher en
    premier), la liste complete classee (pour un lien "voir tout"), et
    les notes "a niveau" pour les dimensions fortes non couvertes par le
    plan. Voir ``app.services.action_plan`` pour la regle de
    construction du plan."""

    priority_plan: list[RankedRecommendation]
    all_recommendations: list[RankedRecommendation]
    dimension_notes: list[DimensionNote]


async def load_reference(db: AsyncSession) -> ReferenceData:
    """Charge dimensions/questions/recommandations actives depuis la base.

    Recalcule intra_weight (1 / nb de questions actives de la dimension) a
    chaque appel plutot que de le mettre en cache : les tables sont petites
    et un edit admin (question desactivee, etc.) doit se refleter
    immediatement, sans probleme de cache a invalider.
    """
    dim_stmt = select(Dimension).where(Dimension.is_active.is_(True))
    dimensions = (await db.execute(dim_stmt)).scalars().all()

    question_stmt = select(Question).where(Question.is_active.is_(True))
    questions = (await db.execute(question_stmt)).scalars().all()

    reco_result = await db.execute(select(Recommendation))
    recommendations = reco_result.scalars().all()

    dim_weight = {d.id: d.weight for d in dimensions}
    dimension_names = {d.id: d.name for d in dimensions}
    question_dimensions = {q.id: q.dimension_id for q in questions}
    # Same weight submit_assessment() uses (app/routers/assessments.py) --
    # scores computed here must match the cached, official ones, or a
    # dimension could be ranked "weak" against a number the user was
    # never actually shown.
    question_weights = {q.id: q.weight for q in questions}

    counts: dict[int, int] = {}
    for dim_id in question_dimensions.values():
        counts[dim_id] = counts.get(dim_id, 0) + 1
    intra_weight = {dim_id: 1.0 / n for dim_id, n in counts.items()}

    catalog = {(r.question_id, r.trigger_level): r for r in recommendations}

    return ReferenceData(
        catalog=catalog,
        dim_weight=dim_weight,
        question_dimensions=question_dimensions,
        question_weights=question_weights,
        intra_weight=intra_weight,
        dimension_names=dimension_names,
    )


def build_evaluation(
    assessment: Assessment, question_dimensions: dict[int, int]
) -> dict[int, int | None]:
    """Niveau actuel par question active ; None si sans reponse (traite
    comme N/A -- couvre a la fois une vraie non-applicabilite future et le
    cas d'une question ajoutee apres la soumission de cet assessment)."""
    answered = {a.question_id: a.value for a in assessment.answers}
    return {q_id: answered.get(q_id) for q_id in question_dimensions}


def _na_rate_by_dimension(
    evaluation: dict[int, int | None], question_dimensions: dict[int, int]
) -> dict[int, float]:
    totals: dict[int, int] = {}
    na_counts: dict[int, int] = {}
    for q_id, level in evaluation.items():
        dim_id = question_dimensions[q_id]
        totals[dim_id] = totals.get(dim_id, 0) + 1
        if level is None:
            na_counts[dim_id] = na_counts.get(dim_id, 0) + 1
    return {
        dim_id: na_counts.get(dim_id, 0) / total
        for dim_id, total in totals.items()
    }


async def get_narrative(db: AsyncSession, assessment: Assessment) -> str:
    """Narrates an assessment's cached results in plain language.

    Reuses the scores already computed and stored at submission time
    (``assessment.score_global`` / ``maturity_label`` / ``dimension_scores``)
    instead of recomputing them, per the constraint that the narrative must
    only ever reflect numbers that were actually persisted.

    Persisted on ``assessment.narrative`` the first time it's computed, and
    read straight from there afterwards -- so revisiting an old
    assessment's results (e.g. from Historique) never re-pays for the LLM
    call, and the narrative survives server restarts (unlike a purely
    in-memory cache).
    """
    if assessment.narrative:
        return assessment.narrative

    dim_stmt = select(Dimension).where(Dimension.is_active.is_(True))
    dimensions = (await db.execute(dim_stmt)).scalars().all()
    dim_names = {d.id: d.name for d in dimensions}

    dimension_scores = {
        dim_names[ds.dimension_id]: ds.score
        for ds in assessment.dimension_scores
        if ds.dimension_id in dim_names
    }
    strongest = max(dimension_scores, key=dimension_scores.get, default=None)
    weakest = min(dimension_scores, key=dimension_scores.get, default=None)

    score_result = {
        "score_global": assessment.score_global,
        "maturity_label": assessment.maturity_label,
        "strongest_dimension": strongest,
        "weakest_dimension": weakest,
        "dimension_scores": dimension_scores,
    }
    # explain_results() makes a blocking network call to the local LLM
    # server; running it directly here would freeze the whole event loop
    # (and therefore every other in-flight request) for its full duration.
    narrative = await run_in_threadpool(explain_results, score_result)

    assessment.narrative = narrative
    db.add(assessment)
    await db.commit()

    return narrative


async def get_comparison_narrative(
    db: AsyncSession, initial: Assessment, current: Assessment
) -> str:
    """One LLM-authored narrative analyzing the evolution between two of a
    bank's assessments together -- e.g. "the score progressed from X to Y,
    driven mainly by dimension Z" -- instead of two independent
    per-assessment narratives read side by side (what ``get_narrative``
    called twice would give you).

    Not persisted like ``get_narrative``: a comparison is keyed on a pair
    of assessment ids the user picks interactively on the Evolution page,
    not on a single assessment, so there's no natural column to cache it
    on; it's recomputed each time (the page already offers a "Regenerer"
    action for a single narrative, so paying for a fresh LLM call here is
    consistent with that).
    """
    dim_stmt = select(Dimension).where(Dimension.is_active.is_(True))
    dimensions = (await db.execute(dim_stmt)).scalars().all()
    dim_names = {d.id: d.name for d in dimensions}

    def _scores(assessment: Assessment) -> dict[str, float]:
        return {
            dim_names[ds.dimension_id]: ds.score
            for ds in assessment.dimension_scores
            if ds.dimension_id in dim_names
        }

    initial_scores = _scores(initial)
    current_scores = _scores(current)
    # Only dimensions present on both -- the questionnaire's dimension set
    # can change between the two submissions being compared.
    shared_names = sorted(set(initial_scores) & set(current_scores))

    comparison_result = {
        "score_global_initial": initial.score_global,
        "score_global_current": current.score_global,
        "maturity_label_initial": initial.maturity_label,
        "maturity_label_current": current.maturity_label,
        "dimension_scores": {
            name: {"initial": initial_scores[name], "current": current_scores[name]}
            for name in shared_names
        },
    }
    # explain_comparison() makes a blocking network call to the local LLM
    # server; running it directly here would freeze the whole event loop
    # for its full duration.
    return await run_in_threadpool(explain_comparison, comparison_result)


async def get_recommendations(
    db: AsyncSession,
    assessment: Assessment,
    *,
    dimension_id: int | None = None,
    target_level: int | None = None,
    top_k_factors: int = 3,
) -> RecommendationPlan:
    """Calcule et classe les recommandations candidates pour un assessment,
    puis en tire un plan d'action prioritaire resserre.

    Sans ``dimension_id``/``target_level`` : Scenario 1 (plan "+1 par
    dimension"). Avec les deux : Scenario 2 (cible personnalisee sur une
    dimension). Leve ``DimensionNotFoundError`` si ``dimension_id`` ne
    correspond a aucune dimension active.

    Le LTR classe TOUTES les recommandations candidates (25 a 30 pour le
    scenario 1) ; ``app.services.action_plan`` en resserre ensuite un
    sous-ensemble prioritaire (voir son docstring pour la regle). Seules
    les recommandations du plan prioritaire recoivent une vraie
    reformulation LLM -- les autres recoivent le fallback instantane, ce
    qui borne le cout de l'appel LLM independamment du nombre total de
    candidats.
    """
    reference = await load_reference(db)

    if dimension_id is not None and dimension_id not in reference.dim_weight:
        raise DimensionNotFoundError(
            f"dimension_id {dimension_id} introuvable"
        )

    evaluation = build_evaluation(assessment, reference.question_dimensions)

    questions = [
        QuestionInput(
            question_id=q_id,
            dimension_id=reference.question_dimensions[q_id],
            weight=reference.question_weights[q_id],
            value=level,
        )
        for q_id, level in evaluation.items()
        if level is not None
    ]
    dimensions = [
        DimensionInput(dimension_id=dim_id, weight=weight)
        for dim_id, weight in reference.dim_weight.items()
    ]
    score_result = compute_scores(questions, dimensions, bands=[])

    if dimension_id is not None and target_level is not None:
        candidates = select_recommendations_custom_target(
            evaluation,
            reference.question_dimensions,
            dimension_id,
            target_level,
            reference.catalog,
        )
    else:
        candidates = select_recommendations_dimension_plus_one(
            evaluation,
            reference.question_dimensions,
            score_result.dimension_scores,
            reference.catalog,
        )

    if not candidates:
        # Pas de recommandation candidate (deja au maximum sur toutes
        # les questions actives) : le plan est vide, mais les notes "a
        # niveau" restent pertinentes et sont donc quand meme calculees.
        _, notes = build_priority_plan(
            [],
            score_result.dimension_scores,
            score_result.global_score,
            reference.dimension_names,
        )
        return RecommendationPlan(
            priority_plan=[], all_recommendations=[], dimension_notes=notes
        )

    na_by_dimension = _na_rate_by_dimension(
        evaluation, reference.question_dimensions
    )

    feature_rows = []
    candidate_dimension_ids = []
    for reco in candidates:
        dim_id = reference.question_dimensions[reco.question_id]
        features = build_features(
            reco=reco,
            current_level=evaluation[reco.question_id],
            dimension_id=dim_id,
            score_result=score_result,
            dim_weight=reference.dim_weight,
            intra_weight=reference.intra_weight,
            category_id_map=_CATEGORY_ID_MAP,
            na_rate_by_dimension=na_by_dimension,
        )
        feature_rows.append(features)
        candidate_dimension_ids.append(dim_id)

    scores = ranking.predict(feature_rows)
    factors = explain.explain_recommendations(
        feature_rows, top_k=top_k_factors
    )

    ranked = sorted(
        zip(candidates, candidate_dimension_ids, scores, factors),
        key=lambda item: item[2],
        reverse=True,
    )

    # Le plan prioritaire se construit AVANT toute reformulation LLM,
    # sur les candidats deja classes par le LTR et expliques par SHAP --
    # ce module ne reclasse rien, il ne fait que selectionner (voir
    # app.services.action_plan). Seul son resultat determine quels
    # candidats meritent une vraie reformulation LLM.
    ranked_candidates = [
        RankedCandidate(
            reco=reco,
            dimension_id=dim_id,
            ltr_score=score,
            shap_factors=factor_list,
        )
        for reco, dim_id, score, factor_list in ranked
    ]
    plan, notes = build_priority_plan(
        ranked_candidates,
        score_result.dimension_scores,
        score_result.global_score,
        reference.dimension_names,
    )
    plan_codes = {c.reco.code for c in plan}

    items = []
    for rank, (reco, dim_id, score, factor_list) in enumerate(ranked, start=1):
        bank_context = {
            "score_global": score_result.global_score,
            "maturity_level": score_result.maturity_label,
            "dimension_score": score_result.dimension_scores.get(dim_id),
            "current_level": evaluation[reco.question_id],
            "target_level": reco.target_level,
        }
        items.append((rank, reco, dim_id, score, factor_list, bank_context))

    # Only plan items get a real (slow, blocking) LLM reformulation; the
    # rest get the instant fallback. Those LLM calls are independent
    # network round-trips to the local model server, so they're run
    # concurrently in worker threads instead of one after another --
    # this both bounds this request's own wall-clock time to the slowest
    # single call (not their sum) and keeps the event loop free to serve
    # every other request while they're in flight.
    plan_items = [item for item in items if item[1].code in plan_codes]
    reformulations = await asyncio.gather(
        *(
            run_in_threadpool(
                reformulate_recommendation, reco, bank_context, factor_list
            )
            for _, reco, _, _, factor_list, bank_context in plan_items
        )
    )
    reformulation_by_code = {
        item[1].code: reformulation
        for item, reformulation in zip(plan_items, reformulations)
    }
    for rank, reco, dim_id, score, factor_list, bank_context in items:
        if reco.code not in reformulation_by_code:
            reformulation_by_code[reco.code] = fallback_reformulation(
                reco, factor_list
            )

    all_recommendations = [
        RankedRecommendation(
            rank=rank,
            score=score,
            recommendation=reco,
            dimension_id=dim_id,
            explanation_factors=factor_list,
            texte_reformule=reformulation_by_code[reco.code]["texte_reformule"],
            justification=reformulation_by_code[reco.code]["justification"],
        )
        for rank, reco, dim_id, score, factor_list, bank_context in items
    ]

    # L'ordre du plan prioritaire est celui decide par action_plan.py
    # (score LTR decroissant), pas une simple relecture de
    # all_recommendations -- on retrouve donc chaque item par code
    # plutot que de supposer que l'ordre des deux listes coincide.
    by_code = {item.recommendation.code: item for item in all_recommendations}
    priority_plan = [by_code[c.reco.code] for c in plan]

    return RecommendationPlan(
        priority_plan=priority_plan,
        all_recommendations=all_recommendations,
        dimension_notes=notes,
    )


def _reco_out(item: RankedRecommendation) -> dict:
    """One ranked recommendation, shaped exactly like ``RecommendationOut``
    (field-for-field) so the dict round-trips straight through that schema
    with no transformation on either side of persistence."""
    return {
        "rank": item.rank,
        "score": item.score,
        "code": item.recommendation.code,
        "title": item.recommendation.title,
        "recommendation_text": item.recommendation.recommendation_text,
        "category": item.recommendation.category,
        "regulatory_flag": item.recommendation.regulatory_flag,
        "effort": item.recommendation.effort,
        "question_id": item.recommendation.question_id,
        "dimension_id": item.dimension_id,
        "trigger_level": item.recommendation.trigger_level,
        "target_level": item.recommendation.target_level,
        "explanation_factors": item.explanation_factors,
        "texte_reformule": item.texte_reformule,
        "justification": item.justification,
    }


def _serialize_plan(plan: RecommendationPlan) -> dict:
    """Shaped exactly like ``RecommendationPlanOut`` so it can be loaded
    straight back into that schema after a round-trip through JSONB."""
    return {
        "plan_prioritaire": [_reco_out(item) for item in plan.priority_plan],
        "recommandations_completes": [
            _reco_out(item) for item in plan.all_recommendations
        ],
        "notes_dimensions": [
            {
                "dimension_id": note.dimension_id,
                "dimension_name": note.dimension_name,
                "dimension_score": note.dimension_score,
                "message": note.message,
            }
            for note in plan.dimension_notes
        ],
    }


async def get_or_create_recommendation_plan(
    db: AsyncSession, assessment: Assessment
) -> dict:
    """The default (Scenario 1) recommendation plan for an assessment,
    persisted the first time it's computed and always read from there
    afterwards.

    This -- not just ``llm.generation``'s in-memory reformulation cache --
    is what makes a previously-viewed assessment's recommendations come
    back instantly no matter how much later they're revisited (e.g. from
    Historique) or whether the server has restarted since: the
    reformulation cache only ever helps within one running process.

    Returns a plain dict shaped like ``RecommendationPlanOut``.
    """
    existing = await db.get(AssessmentRecommendationPlan, assessment.id)
    if existing is not None:
        return existing.plan

    plan = await get_recommendations(db, assessment)
    serialized = _serialize_plan(plan)

    # ON CONFLICT DO NOTHING: if a concurrent caller (e.g. the background
    # prewarm task, racing a live page load) already persisted a plan for
    # this assessment in the meantime, keep theirs rather than error out
    # or overwrite it -- both callers should agree on one stored plan.
    stmt = (
        pg_insert(AssessmentRecommendationPlan)
        .values(assessment_id=assessment.id, plan=serialized)
        .on_conflict_do_nothing(index_elements=["assessment_id"])
    )
    await db.execute(stmt)
    await db.commit()

    row = await db.get(AssessmentRecommendationPlan, assessment.id)
    assert row is not None
    return row.plan


async def prewarm_recommendations(assessment_id: int) -> None:
    """Computes and persists the default recommendation plan for an
    assessment.

    Meant to run as a ``BackgroundTasks`` job right after a submission, so
    the slow, LLM-bound reformulation work for the plan a user will see on
    the Recommendations page (Scenario 1 -- no ``dimension_id``/
    ``target_level``, exactly what that page requests by default) is
    already done -- and permanently persisted -- by the time they navigate
    there themselves.

    Uses its own DB session rather than the submitting request's, since it
    keeps running after that request's response (and session) are gone.
    Any failure here is swallowed and logged: this is a latency
    optimization only, never a requirement -- the Recommendations page
    computes (and persists) the plan itself if this never ran or failed.
    """
    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                select(Assessment)
                .where(Assessment.id == assessment_id)
                .options(selectinload(Assessment.answers))
            )
            assessment = (await db.execute(stmt)).scalar_one_or_none()
            if assessment is None:
                return
            await get_or_create_recommendation_plan(db, assessment)
    except Exception:
        logger.exception(
            "Background recommendation prewarm failed for assessment %s",
            assessment_id,
        )


async def prewarm_narrative(assessment_id: int) -> None:
    """Computes and persists the results narrative for an assessment.

    Same rationale and shape as ``prewarm_recommendations``: runs as a
    ``BackgroundTasks`` job right after submission, on its own DB session,
    so the Results page's narrative is already computed -- and, since
    ``get_narrative`` persists it, permanently cached -- by the time the
    user gets there. Any failure here is swallowed and logged: the Results
    page computes (and persists) it itself if this never ran or failed.
    """
    try:
        async with AsyncSessionLocal() as db:
            stmt = (
                select(Assessment)
                .where(Assessment.id == assessment_id)
                .options(selectinload(Assessment.dimension_scores))
            )
            assessment = (await db.execute(stmt)).scalar_one_or_none()
            if assessment is None:
                return
            await get_narrative(db, assessment)
    except Exception:
        logger.exception(
            "Background narrative prewarm failed for assessment %s",
            assessment_id,
        )
