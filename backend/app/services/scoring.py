from __future__ import annotations

from dataclasses import dataclass


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


def weighted_average(pairs: list[tuple[float, float]]) -> float:
    if not pairs:
        return 0.0

    total_weight = sum(weight for _, weight in pairs)
    if total_weight == 0:
        return sum(value for value, _ in pairs) / len(pairs)

    return sum(value * weight for value, weight in pairs) / total_weight


def map_to_maturity_level(score: float, bands: list[MaturityBand]) -> str | None:
    if not bands:
        return None

    ordered = sorted(bands, key=lambda b: b.min_score)

    label = ordered[0].label
    for band in ordered:
        if score >= band.min_score:
            label = band.label
        else:
            break
    return label


def compute_scores(
    questions: list[QuestionInput],
    dimensions: list[DimensionInput],
    bands: list[MaturityBand],
) -> ScoreResult:
    by_dimension: dict[int, list[QuestionInput]] = {}
    for q in questions:
        by_dimension.setdefault(q.dimension_id, []).append(q)

    dimension_scores: dict[int, float] = {
        dim_id: weighted_average([(q.value, q.weight) for q in qs])
        for dim_id, qs in by_dimension.items()
    }

    dim_weight = {d.dimension_id: d.weight for d in dimensions}
    global_pairs = [
        (score, dim_weight.get(dim_id, 0.0))
        for dim_id, score in dimension_scores.items()
    ]
    global_score = weighted_average(global_pairs)

    return ScoreResult(
        dimension_scores=dimension_scores,
        global_score=global_score,
        maturity_label=map_to_maturity_level(global_score, bands),
    )
