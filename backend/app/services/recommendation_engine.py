"""Orchestrates ranked, explained recommendations for a stored assessment.

Ties together the pieces that already exist separately: live reference data
from the DB, ``scoring.py``'s selection scenarios, ``features.py``'s feature
builder, ``ranking.py``'s trained model, and ``explain.py``'s SHAP factors.
Nothing here reimplements any of that logic -- this module only loads data
and calls the existing functions in the right order.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assessment, Dimension, Question, Recommendation
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
    explain_results,
    fallback_reformulation,
    reformulate_recommendation,
)

_CATEGORY_ID_MAP = {cat: i for i, cat in enumerate(CATEGORY_ORDER)}


class DimensionNotFoundError(Exception):
    """Raised when a requested dimension_id isn't an active dimension."""


@dataclass(frozen=True)
class ReferenceData:
    catalog: dict[tuple[int, int], Recommendation]
    dim_weight: dict[int, float]
    question_dimensions: dict[int, int]
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

    counts: dict[int, int] = {}
    for dim_id in question_dimensions.values():
        counts[dim_id] = counts.get(dim_id, 0) + 1
    intra_weight = {dim_id: 1.0 / n for dim_id, n in counts.items()}

    catalog = {(r.question_id, r.trigger_level): r for r in recommendations}

    return ReferenceData(
        catalog=catalog,
        dim_weight=dim_weight,
        question_dimensions=question_dimensions,
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
    """
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
    return explain_results(score_result)


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
            weight=1.0,
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

    all_recommendations = []
    for rank, (reco, dim_id, score, factor_list) in enumerate(
        ranked, start=1
    ):
        bank_context = {
            "score_global": score_result.global_score,
            "maturity_level": score_result.maturity_label,
            "dimension_score": score_result.dimension_scores.get(dim_id),
            "current_level": evaluation[reco.question_id],
            "target_level": reco.target_level,
        }
        if reco.code in plan_codes:
            reformulation = reformulate_recommendation(
                reco, bank_context, factor_list
            )
        else:
            reformulation = fallback_reformulation(reco, factor_list)
        all_recommendations.append(
            RankedRecommendation(
                rank=rank,
                score=score,
                recommendation=reco,
                dimension_id=dim_id,
                explanation_factors=factor_list,
                texte_reformule=reformulation["texte_reformule"],
                justification=reformulation["justification"],
            )
        )

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
