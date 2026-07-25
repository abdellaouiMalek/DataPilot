"""Synthetic Learning-to-Rank dataset generator for the recommendation model.

Simulates realistic bank evaluations (correlated question levels, not
independent noise), scores and selects candidate recommendations through the
real `app.services.scoring` pipeline (never reimplemented here), builds their
features through `app.services.features`, and derives a training label from
a hidden oracle that is never exposed as a feature.

Usage (from backend/ml/):
    python generate_ltr_dataset.py --n 600 --seed 42
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

# Bootstrap the import path so this script runs standalone
# (`python generate_ltr_dataset.py`) without needing `-m` or a package init.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Same convention as app/db/database.py: read DATABASE_URL from backend/.env
# so --db-url has a working default on a normal local checkout, instead of
# always falling back to a SQL file that isn't part of the repo.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.services.features import (  # noqa: E402
    CATEGORY_ORDER,
    FEATURE_COLUMNS,
    build_features,
)
from app.services.scoring import (  # noqa: E402
    DimensionInput,
    QuestionInput,
    compute_scores,
    select_recommendations_dimension_plus_one,
)

MAX_LEVEL = 5

# Fallback-path only (see _load_reference_from_sql): the standalone schema
# file has no `questions` table, so this fixed structure -- given directly by
# the catalog's own design (D1=q1..4, D2=q5..11, ..., D6=q29..32) -- is what
# rebuilds the question -> dimension mapping. The Postgres path never uses
# this; it reads real per-question dimension_id values instead.
QUESTIONS_PER_DIMENSION = (4, 7, 7, 6, 4, 4)
DIMENSION_CODES = ("D1", "D2", "D3", "D4", "D5", "D6")


@dataclass(frozen=True)
class CatalogRecommendation:
    """One row of the recommendations catalog, as build_features expects."""

    code: str
    question_id: int
    trigger_level: int
    target_level: int
    category: str
    regulatory_flag: int
    effort: int


@dataclass(frozen=True)
class ReferenceData:
    """Everything generate_evaluation/scoring/features need, loaded once."""

    catalog: dict[tuple[int, int], CatalogRecommendation]
    dim_weight: dict[int, float]
    question_dimensions: dict[int, int]
    intra_weight: dict[int, float]


def _intra_weight_from_counts(
    question_dimensions: dict[int, int],
) -> dict[int, float]:
    """Equal intra-dimension weight: 1 / (number of questions in it)."""
    counts: dict[int, int] = {}
    for dimension_id in question_dimensions.values():
        counts[dimension_id] = counts.get(dimension_id, 0) + 1
    return {dim_id: 1.0 / n for dim_id, n in counts.items()}


def _load_reference_from_db(db_url: str) -> ReferenceData:
    """Loads dimensions/questions/recommendations straight from Postgres."""
    import psycopg2  # lazy import: only needed on this path

    dsn = db_url.replace("+asyncpg", "")
    with psycopg2.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, weight FROM dimensions "
            "WHERE is_active = TRUE ORDER BY id"
        )
        dim_weight = {row[0]: float(row[1]) for row in cur.fetchall()}

        cur.execute(
            "SELECT id, dimension_id FROM questions "
            "WHERE is_active = TRUE ORDER BY id"
        )
        question_dimensions = {row[0]: row[1] for row in cur.fetchall()}

        cur.execute(
            "SELECT question_id, trigger_level, target_level, code, "
            "category, regulatory_flag, effort FROM recommendations "
            "ORDER BY question_id, trigger_level"
        )
        catalog = {}
        for row in cur.fetchall():
            q_id, trig, target, code, category, reg_flag, effort = row
            catalog[(q_id, trig)] = CatalogRecommendation(
                code=code,
                question_id=q_id,
                trigger_level=trig,
                target_level=target,
                category=category,
                regulatory_flag=int(bool(reg_flag)),
                effort=effort,
            )

    intra_weight = _intra_weight_from_counts(question_dimensions)
    return ReferenceData(
        catalog, dim_weight, question_dimensions, intra_weight
    )


# Matches (id, 'code', 'name', weight) tuples in the dimensions INSERT.
_DIM_RE = re.compile(
    r"\(\s*(\d+)\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*([\d.]+)\s*\)"
)
# Matches (code, question_id, trigger, target, title, text, category,
# reg_flag, effort) tuples across every recommendations INSERT block.
_RECO_RE = re.compile(
    r"\(\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"
    r"'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'([^']+)'\s*,\s*"
    r"(TRUE|FALSE)\s*,\s*(\d+)\s*\)",
    re.IGNORECASE,
)


def _load_reference_from_sql(sql_path: Path) -> ReferenceData:
    """Regex fallback: parses the standalone schema+catalog SQL file.

    Used only when --db-url isn't given. Dimension weights are always
    parsed from the file's own `INSERT INTO dimensions` block, never
    hardcoded.
    """
    text = sql_path.read_text(encoding="utf-8")

    dims_section = text.split("INSERT INTO dimensions", 1)[1]
    dims_section = dims_section.split(";", 1)[0]
    dim_rows = {
        code: int(dim_id)
        for dim_id, code, _name, _weight in _DIM_RE.findall(dims_section)
    }
    dim_weight = {
        int(dim_id): float(weight)
        for dim_id, _code, _name, weight in _DIM_RE.findall(dims_section)
    }

    question_dimensions: dict[int, int] = {}
    question_id = 1
    for code, count in zip(DIMENSION_CODES, QUESTIONS_PER_DIMENSION):
        dimension_id = dim_rows[code]
        for _ in range(count):
            question_dimensions[question_id] = dimension_id
            question_id += 1

    catalog: dict[tuple[int, int], CatalogRecommendation] = {}
    for match in _RECO_RE.finditer(text):
        code, q, trig, target, _title, _body, category, flag, effort = (
            match.groups()
        )
        catalog[(int(q), int(trig))] = CatalogRecommendation(
            code=code,
            question_id=int(q),
            trigger_level=int(trig),
            target_level=int(target),
            category=category,
            regulatory_flag=1 if flag.upper() == "TRUE" else 0,
            effort=int(effort),
        )

    intra_weight = _intra_weight_from_counts(question_dimensions)
    return ReferenceData(
        catalog, dim_weight, question_dimensions, intra_weight
    )


def load_reference(sql_path: Path, db_url: str | None) -> ReferenceData:
    """Loads reference data: Postgres if db_url is given, else the SQL file."""
    if db_url:
        return _load_reference_from_db(db_url)
    return _load_reference_from_sql(sql_path)


def generate_evaluation(
    rng: np.random.Generator,
    question_dimensions: dict[int, int],
    na_rate: float,
) -> dict[int, int | None]:
    """Draws one realistic, internally-correlated bank evaluation.

    A bank-wide profile anchors a per-dimension bias, which in turn anchors
    each question's level, so answers within a dimension correlate with
    each other instead of being drawn independently.
    """
    dimension_questions: dict[int, list[int]] = {}
    for question_id, dimension_id in question_dimensions.items():
        dimension_questions.setdefault(dimension_id, []).append(question_id)

    profile = rng.normal(3.0, 0.9)
    evaluation: dict[int, int | None] = {}

    for dimension_id, question_ids in dimension_questions.items():
        dimension_bias = profile + rng.normal(0, 0.7)
        for question_id in sorted(question_ids):
            if rng.random() < na_rate:
                evaluation[question_id] = None
                continue
            raw_level = dimension_bias + rng.normal(0, 0.6)
            evaluation[question_id] = int(
                round(float(np.clip(raw_level, 1, MAX_LEVEL)))
            )

    return evaluation


def _na_rate_by_dimension(
    evaluation: dict[int, int | None],
    question_dimensions: dict[int, int],
) -> dict[int, float]:
    """Share of N/A answers per dimension, for this evaluation only."""
    totals: dict[int, int] = {}
    na_counts: dict[int, int] = {}
    for question_id, level in evaluation.items():
        dimension_id = question_dimensions[question_id]
        totals[dimension_id] = totals.get(dimension_id, 0) + 1
        if level is None:
            na_counts[dimension_id] = na_counts.get(dimension_id, 0) + 1
    return {
        dim_id: na_counts.get(dim_id, 0) / total
        for dim_id, total in totals.items()
    }


def _oracle_latent(
    rng: np.random.Generator,
    gap_to_max: int,
    question_global_weight: float,
    max_question_global_weight: float,
    regulatory_flag: int,
    dimension_is_weakest: int,
    effort: int,
    current_level: int,
) -> float:
    """Hidden relevance signal used only to derive training labels.

    Deliberately not a feature and never written to the dataset: it
    combines the raw features non-linearly plus noise, so the ranking model
    has to learn the combination instead of being handed it directly
    (which would make training circular and worthless).
    """
    leverage = (gap_to_max / 4) * (
        question_global_weight / max_question_global_weight
    )
    return (
        5.0 * leverage
        + 3.0 * regulatory_flag
        + 1.5 * dimension_is_weakest
        - 1.2 * (effort - 1)
        + 1.0 * (current_level == 1)
        + rng.normal(0, 0.5)
    )


def _latents_to_relevance(latents: list[float]) -> list[int]:
    """Converts latent scores to 0-4 relevance labels, ranked within group.

    Ties broken by original order (pandas' rank(method="first")
    equivalent) -- practically moot given the continuous noise term, but
    keeps the conversion well-defined regardless.
    """
    n = len(latents)
    if n == 1:
        return [2]

    order = sorted(range(n), key=lambda i: (latents[i], i))
    ranks = [0] * n
    for rank, i in enumerate(order, start=1):
        ranks[i] = rank

    return [round(4 * (rank - 1) / (n - 1)) for rank in ranks]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a synthetic LTR dataset for the recommendation "
            "ranking model."
        )
    )
    parser.add_argument("--n", type=int, default=600)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--na-rate", type=float, default=0.03)
    parser.add_argument("--out-dir", type=Path, default=Path("."))
    parser.add_argument(
        "--sql", type=Path, default=Path("01_schema_recommandations.sql")
    )
    parser.add_argument(
        "--db-url", type=str, default=os.getenv("DATABASE_URL")
    )
    args = parser.parse_args()

    reference = load_reference(args.sql, args.db_url)
    category_id_map = {cat: i for i, cat in enumerate(CATEGORY_ORDER)}
    max_question_global_weight = max(
        reference.dim_weight[dim_id] * reference.intra_weight[dim_id]
        for dim_id in reference.intra_weight
    )

    rng = np.random.default_rng(args.seed)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    responses_path = args.out_dir / "synthetic_responses.csv"
    dataset_path = args.out_dir / "ltr_dataset.csv"
    group_path = args.out_dir / "ltr_dataset.group"

    group_sizes: list[int] = []
    candidate_counts: list[int] = []
    relevance_distribution: dict[int, int] = {i: 0 for i in range(5)}

    with (
        responses_path.open("w", newline="", encoding="utf-8") as resp_f,
        dataset_path.open("w", newline="", encoding="utf-8") as ds_f,
    ):
        resp_writer = csv.writer(resp_f)
        resp_writer.writerow(["assessment_id", "question_id", "level"])

        ds_writer = csv.writer(ds_f)
        ds_writer.writerow(
            ["assessment_id", "reco_code", "question_id", "dimension_id"]
            + FEATURE_COLUMNS
            + ["relevance"]
        )

        for assessment_id in range(1, args.n + 1):
            evaluation = generate_evaluation(
                rng, reference.question_dimensions, args.na_rate
            )

            for question_id, level in evaluation.items():
                resp_writer.writerow(
                    [
                        assessment_id,
                        question_id,
                        "" if level is None else level,
                    ]
                )

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

            candidates = select_recommendations_dimension_plus_one(
                evaluation,
                reference.question_dimensions,
                score_result.dimension_scores,
                reference.catalog,
            )
            candidate_counts.append(len(candidates))

            na_by_dim = _na_rate_by_dimension(
                evaluation, reference.question_dimensions
            )

            rows = []
            latents = []
            for reco in candidates:
                dimension_id = reference.question_dimensions[
                    reco.question_id
                ]
                current_level = evaluation[reco.question_id]
                features = build_features(
                    reco=reco,
                    current_level=current_level,
                    dimension_id=dimension_id,
                    score_result=score_result,
                    dim_weight=reference.dim_weight,
                    intra_weight=reference.intra_weight,
                    category_id_map=category_id_map,
                    na_rate_by_dimension=na_by_dim,
                )
                latents.append(
                    _oracle_latent(
                        rng,
                        gap_to_max=features["gap_to_max"],
                        question_global_weight=features[
                            "question_global_weight"
                        ],
                        max_question_global_weight=(
                            max_question_global_weight
                        ),
                        regulatory_flag=features["regulatory_flag"],
                        dimension_is_weakest=features[
                            "dimension_is_weakest"
                        ],
                        effort=features["effort"],
                        current_level=current_level,
                    )
                )
                rows.append((reco, dimension_id, features))

            relevances = _latents_to_relevance(latents) if rows else []

            for (reco, dimension_id, features), relevance in zip(
                rows, relevances
            ):
                relevance_distribution[relevance] += 1
                ds_writer.writerow(
                    [assessment_id, reco.code, reco.question_id, dimension_id]
                    + [features[col] for col in FEATURE_COLUMNS]
                    + [relevance]
                )

            group_sizes.append(len(candidates))

    group_path.write_text(
        "\n".join(str(size) for size in group_sizes) + "\n",
        encoding="utf-8",
    )

    total_rows = sum(group_sizes)
    print(f"Evaluations generated : {args.n}")
    print(f"Groups written        : {len(group_sizes)}")
    print(f"Dataset rows          : {total_rows}")
    if candidate_counts:
        mean_candidates = sum(candidate_counts) / len(candidate_counts)
        print(
            "Candidates/evaluation : "
            f"mean={mean_candidates:.2f} "
            f"min={min(candidate_counts)} max={max(candidate_counts)}"
        )
    print(f"Relevance distribution: {relevance_distribution}")


if __name__ == "__main__":
    main()
