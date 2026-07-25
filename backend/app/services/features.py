"""Feature engineering for the recommendation Learning-to-Rank model.

Shared by offline training-set generation
(``ml/generate_ltr_dataset.py``) and online inference (the future
recommendation-request endpoint), so the two can never diverge
(train/serve skew). All features are derived solely from the
questionnaire answers and the static recommendation catalog -- no
external data.
"""

from __future__ import annotations

from typing import Any

from app.services.scoring import MAX_LEVEL, ScoreResult

# Canonical order of the reco_category enum, as declared in the Postgres
# schema (CREATE TYPE reco_category AS ENUM (...)). category_id encodes a
# recommendation's category as its index in this tuple.
CATEGORY_ORDER = (
    "strategie",
    "gouvernance",
    "qualite",
    "architecture",
    "securite",
    "analytique",
    "competences",
    "process",
)

# Canonical feature order. Both training and inference MUST emit features in
# this exact order -- LightGBM has no notion of column names, only positions.
FEATURE_COLUMNS = [
    "current_level",
    "gap_to_max",
    "question_global_weight",
    "dimension_weight",
    "dimension_score",
    "global_score",
    "regulatory_flag",
    "effort",
    "dimension_is_weakest",
    "na_rate_dimension",
    "category_id",
]


def build_features(
    reco: Any,
    current_level: int,
    dimension_id: int,
    score_result: ScoreResult,
    dim_weight: dict[int, float],
    intra_weight: dict[int, float],
    category_id_map: dict[str, int],
    na_rate_by_dimension: dict[int, float],
) -> dict[str, float]:
    """Builds the feature dict for one (question, candidate reco) pair.

    ``reco`` only needs ``category``, ``regulatory_flag`` and ``effort``
    attributes -- a DB row, an ORM instance, or a plain dataclass all work.
    ``current_level``/``dimension_id`` describe the question the
    recommendation targets; ``score_result`` is the bank's already-computed
    ``compute_scores(...)`` output for the same evaluation.

    ``na_rate_by_dimension`` is not part of the spec's parameter list, but is
    required to produce the ``na_rate_dimension`` feature it asks for: the
    proportion of not-applicable answers in ``dimension_id``, computed by the
    caller from the raw evaluation (one value per dimension, not per
    question).
    """
    dimension_weight = dim_weight[dimension_id]
    question_global_weight = dimension_weight * intra_weight[dimension_id]

    weakest_dimension_id = min(
        score_result.dimension_scores, key=score_result.dimension_scores.get
    )

    return {
        "current_level": current_level,
        "gap_to_max": MAX_LEVEL - current_level,
        "question_global_weight": question_global_weight,
        "dimension_weight": dimension_weight,
        "dimension_score": score_result.dimension_scores[dimension_id],
        "global_score": score_result.global_score,
        "regulatory_flag": int(reco.regulatory_flag),
        "effort": reco.effort,
        "dimension_is_weakest": int(dimension_id == weakest_dimension_id),
        "na_rate_dimension": na_rate_by_dimension.get(dimension_id, 0.0),
        "category_id": category_id_map[reco.category],
    }
