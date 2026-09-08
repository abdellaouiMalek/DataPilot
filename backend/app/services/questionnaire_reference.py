"""The questionnaire an assessment was actually answered on.

A stored assessment keeps raw answers keyed by ``question_id``, but those ids
are *historical* -- deliberately not foreign keys (see ``Answer.question_id``).
The live ``dimensions`` / ``questions`` tables move on: publishing or restoring
a version rewrites them, and a question a later version dropped is really gone.

So anything reading an assessment back -- its scores, its report, its
recommendations -- must resolve those ids against the snapshot frozen in
``questionnaire_versions`` when the assessment was submitted, never against
whatever is live today. That is what this module does, and it is the reason the
framework no longer has to deactivate a question rather than delete it.

The live framework is still the right reference for a *new* submission, so
``live_reference`` builds the same shape from the live tables.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Assessment, Dimension, Question, QuestionnaireVersion


@dataclass(frozen=True)
class DimensionRef:
    id: int
    key: str
    name: str
    weight: float
    color: str
    is_active: bool


@dataclass(frozen=True)
class QuestionRef:
    id: int
    dimension_id: int
    text: str
    weight: float
    is_active: bool


@dataclass(frozen=True)
class QuestionnaireRef:
    """One questionnaire, flattened to what every reader actually needs.

    Holds inactive rows too: a question deactivated *within* the version it was
    published in is still part of that record, and callers that only want what
    was asked use the ``active_*`` views.
    """

    dimensions: dict[int, DimensionRef]
    questions: dict[int, QuestionRef]

    @property
    def active_dimensions(self) -> dict[int, DimensionRef]:
        return {i: d for i, d in self.dimensions.items() if d.is_active}

    @property
    def active_questions(self) -> dict[int, QuestionRef]:
        """Questions that were askable: active, in an active dimension."""
        active_dims = self.active_dimensions
        return {
            i: q
            for i, q in self.questions.items()
            if q.is_active and q.dimension_id in active_dims
        }

    def dimension_name(self, dimension_id: int, default: str = "") -> str:
        dimension = self.dimensions.get(dimension_id)
        return dimension.name if dimension else default


def _as_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def reference_from_tree(tree: Sequence[dict[str, Any]]) -> QuestionnaireRef:
    """Index a snapshot's ``dimensions`` array."""
    dimensions: dict[int, DimensionRef] = {}
    questions: dict[int, QuestionRef] = {}

    for node in tree or []:
        dimension_id = node.get("id")
        if not isinstance(dimension_id, int):
            continue
        dimensions[dimension_id] = DimensionRef(
            id=dimension_id,
            key=node.get("key") or "",
            name=node.get("name") or "",
            weight=_as_float(node.get("weight")),
            color=node.get("color") or "#1A1A1A",
            is_active=bool(node.get("is_active", True)),
        )
        for sub in node.get("sub_dimensions", []) or []:
            for question in sub.get("questions", []) or []:
                question_id = question.get("id")
                if not isinstance(question_id, int):
                    continue
                questions[question_id] = QuestionRef(
                    id=question_id,
                    # Snapshots written before sub-dimensions could move carry
                    # the dimension on the question itself; fall back to the
                    # branch it is nested under when it's missing.
                    dimension_id=question.get("dimension_id") or dimension_id,
                    text=question.get("text") or "",
                    weight=_as_float(question.get("weight")),
                    is_active=bool(question.get("is_active", True)),
                )

    return QuestionnaireRef(dimensions=dimensions, questions=questions)


async def live_reference(db: AsyncSession) -> QuestionnaireRef:
    """The framework as it stands right now, for scoring a new submission."""
    dimensions = (await db.execute(select(Dimension))).scalars().all()
    questions = (await db.execute(select(Question))).scalars().all()
    return QuestionnaireRef(
        dimensions={
            d.id: DimensionRef(
                id=d.id,
                key=d.key,
                name=d.name,
                weight=d.weight,
                color=d.color,
                is_active=d.is_active,
            )
            for d in dimensions
        },
        questions={
            q.id: QuestionRef(
                id=q.id,
                dimension_id=q.dimension_id,
                text=q.text,
                weight=q.weight,
                is_active=q.is_active,
            )
            for q in questions
        },
    )


def _snapshot_tree(version: QuestionnaireVersion | None) -> list[dict[str, Any]] | None:
    if version is None or not isinstance(version.snapshot, dict):
        return None
    tree = version.snapshot.get("dimensions")
    return tree if isinstance(tree, list) and tree else None


async def reference_for(db: AsyncSession, assessment: Assessment) -> QuestionnaireRef:
    """The questionnaire ``assessment`` was answered on.

    Falls back to the live framework only when the assessment carries no usable
    snapshot at all, which the ``7d2ca4b90e18`` migration eliminated, so it is
    a safety net for rows created outside it rather than a normal path.
    """
    if assessment.version_id is not None:
        version = await db.get(QuestionnaireVersion, assessment.version_id)
        tree = _snapshot_tree(version)
        if tree is not None:
            return reference_from_tree(tree)
    return await live_reference(db)


async def references_for(
    db: AsyncSession, assessments: Iterable[Assessment]
) -> dict[int, QuestionnaireRef]:
    """Same, for a list, one query for every version they span.

    History pages render assessments from several versions at once; resolving
    each one separately would be a query per row.
    """
    assessments = list(assessments)
    version_ids = {a.version_id for a in assessments if a.version_id is not None}

    by_version: dict[int, QuestionnaireRef] = {}
    if version_ids:
        versions = (
            await db.execute(
                select(QuestionnaireVersion).where(
                    QuestionnaireVersion.id.in_(version_ids)
                )
            )
        ).scalars().all()
        for version in versions:
            tree = _snapshot_tree(version)
            if tree is not None:
                by_version[version.id] = reference_from_tree(tree)

    live: QuestionnaireRef | None = None
    result: dict[int, QuestionnaireRef] = {}
    for assessment in assessments:
        reference = by_version.get(assessment.version_id)  # type: ignore[arg-type]
        if reference is None:
            if live is None:
                live = await live_reference(db)
            reference = live
        result[assessment.id] = reference
    return result


def merge_dimensions(
    references: Iterable[QuestionnaireRef],
) -> dict[int, DimensionRef]:
    """Union of several questionnaires' dimensions, earlier ones winning.

    A comparison report spans two assessments that may sit on different
    versions; a dimension only one of them knows about still needs a name.
    """
    merged: dict[int, DimensionRef] = {}
    for reference in references:
        for dimension_id, dimension in reference.dimensions.items():
            merged.setdefault(dimension_id, dimension)
    return merged
