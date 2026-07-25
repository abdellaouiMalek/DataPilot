from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

# =============================================================================
# DATA CLASSES
# =============================================================================


@dataclass(frozen=True)
class QuestionInput:
    question_id: int
    dimension_id: int
    weight: float
    value: int


@dataclass(frozen=True)
class DimensionInput:
    dimension_id: int
    weight: float


@dataclass(frozen=True)
class MaturityBand:
    label: str
    min_score: float
    max_score: float


@dataclass(frozen=True)
class ScoreResult:
    dimension_scores: dict[int, float]
    global_score: float
    maturity_label: str | None


# Generic recommendation type
RecommendationT = TypeVar("RecommendationT")

MAX_LEVEL = 5


# =============================================================================
# SCORE CALCULATION
# =============================================================================

def weighted_average(pairs: list[tuple[float, float]]) -> float:
    """
    Calculates a weighted average.

    Each tuple contains:
    (value, weight)
    """

    if not pairs:
        return 0.0

    total_weight = sum(weight for _, weight in pairs)

    # If all weights are zero, calculate a simple average
    if total_weight == 0:
        return sum(value for value, _ in pairs) / len(pairs)

    return (
        sum(value * weight for value, weight in pairs)
        / total_weight
    )


def map_to_maturity_level(
    score: float,
    bands: list[MaturityBand],
) -> str | None:
    """
    Converts the global numerical score into a maturity label.
    """

    if not bands:
        return None

    ordered_bands = sorted(
        bands,
        key=lambda band: band.min_score,
    )

    for band in ordered_bands:
        if band.min_score <= score <= band.max_score:
            return band.label

    return None


def compute_scores(
    questions: list[QuestionInput],
    dimensions: list[DimensionInput],
    bands: list[MaturityBand],
) -> ScoreResult:
    """
    Calculates:

    1. The score of each dimension
    2. The global maturity score
    3. The global maturity label
    """

    # Group questions by dimension
    questions_by_dimension: dict[int, list[QuestionInput]] = {}

    for question in questions:
        questions_by_dimension.setdefault(
            question.dimension_id,
            [],
        ).append(question)

    # Calculate the weighted score of each dimension
    dimension_scores: dict[int, float] = {}

    for dimension_id, dimension_questions in questions_by_dimension.items():
        question_pairs = [
            (question.value, question.weight)
            for question in dimension_questions
        ]

        dimension_scores[dimension_id] = weighted_average(
            question_pairs
        )

    # Create a dictionary containing the weight of each dimension
    dimension_weights = {
        dimension.dimension_id: dimension.weight
        for dimension in dimensions
    }

    # Prepare dimension score and weight pairs
    global_pairs = [
        (
            dimension_score,
            dimension_weights.get(dimension_id, 0.0),
        )
        for dimension_id, dimension_score in dimension_scores.items()
    ]

    # Calculate the global weighted score
    global_score = weighted_average(global_pairs)

    # Find the corresponding maturity label
    maturity_label = map_to_maturity_level(
        global_score,
        bands,
    )

    return ScoreResult(
        dimension_scores=dimension_scores,
        global_score=global_score,
        maturity_label=maturity_label,
    )


# =============================================================================
# SCENARIO 1: +1 PER DIMENSION
# =============================================================================

def select_recommendations_dimension_plus_one(
    evaluation: dict[int, int | None],
    question_dimensions: dict[int, int],
    dimension_scores: dict[int, float],
    catalog: dict[tuple[int, int], RecommendationT],
) -> list[RecommendationT]:
    """
    Scenario 1:

    The system tries to improve every dimension by +1.

    The dimension scores are not recalculated here.
    They come directly from compute_scores().
    """

    # Example:
    # Current dimension score = 2.7
    # Target score = 3.7
    dimension_targets = {
        dimension_id: min(
            current_score + 1,
            MAX_LEVEL,
        )
        for dimension_id, current_score in dimension_scores.items()
    }

    candidates: list[RecommendationT] = []

    for question_id, current_level in evaluation.items():

        # Ignore N/A questions
        if current_level is None:
            continue

        # Ignore questions already at level 5
        if current_level >= MAX_LEVEL:
            continue

        # Find the dimension of the question
        dimension_id = question_dimensions.get(question_id)

        if dimension_id is None:
            continue

        # Get the target of that dimension
        target_level = dimension_targets.get(dimension_id)

        if target_level is None:
            continue

        # Ignore questions already at or above the target
        if current_level >= target_level:
            continue

        # Select the recommendation for the next atomic step
        # Example:
        # current level 2 -> recommendation for 2 to 3
        recommendation = catalog.get(
            (question_id, current_level)
        )

        if recommendation is not None:
            candidates.append(recommendation)

    return candidates


# =============================================================================
# SCENARIO 2: CUSTOM TARGET FOR ONE DIMENSION
# =============================================================================

def select_recommendations_custom_target(
    evaluation: dict[int, int | None],
    question_dimensions: dict[int, int],
    dimension_id: int,
    target_level: int,
    catalog: dict[tuple[int, int], RecommendationT],
) -> list[RecommendationT]:
    """
    Scenario 2:

    The user selects one dimension and a target level.

    The function returns all recommendation steps required
    for every question to reach that target.
    """

    if target_level < 1 or target_level > MAX_LEVEL:
        raise ValueError(
            f"target_level must be between 1 and {MAX_LEVEL}"
        )

    candidates: list[RecommendationT] = []

    for question_id, current_level in evaluation.items():

        # Ignore N/A questions
        if current_level is None:
            continue

        # Ignore questions outside the selected dimension
        if question_dimensions.get(question_id) != dimension_id:
            continue

        # Ignore questions already at or above the target
        if current_level >= target_level:
            continue

        # Retrieve the full chain of recommendations
        #
        # Example:
        # current level = 2
        # target level = 5
        #
        # Recommendations:
        # 2 -> 3
        # 3 -> 4
        # 4 -> 5
        for trigger_level in range(
            current_level,
            target_level,
        ):
            recommendation = catalog.get(
                (question_id, trigger_level)
            )

            if recommendation is not None:
                candidates.append(recommendation)

    return candidates
