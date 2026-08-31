from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.lookups import Bank


class Assessment(Base):
    """A single completed questionnaire submission.

    ``score_global`` / ``maturity_label`` and per-dimension scores are cached
    snapshots computed at submission time (scoring logic lands in a later phase);
    the raw answers are kept in :class:`Answer` so results stay reproducible even
    if questions change afterwards.
    """

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # RESTRICT: banks with assessments can't be hard-deleted — archive instead.
    bank_id: Mapped[int] = mapped_column(
        ForeignKey("banks.id", ondelete="RESTRICT"), index=True
    )
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    evaluator_role: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Keycloak `sub` claim of the submitter, so a user can list their own
    # past assessments. Nullable: rows from before this column existed
    # have no known owner.
    keycloak_sub: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True, index=True
    )

    # The published questionnaire this was answered on, stamped at submission.
    # Questions are edited in place, so without this an old assessment can only
    # be read back against today's wording; with it, the frozen snapshot in
    # `questionnaire_versions` says exactly what was asked.
    # Nullable: assessments submitted before the first version was published
    # have no snapshot to point at (see the backfill in the migration).
    # RESTRICT: a version referenced by assessments must stay readable.
    version_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("questionnaire_versions.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )

    score_global: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maturity_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Cached LLM-authored narrative of this assessment's results (see
    # app.services.recommendation_engine.get_narrative). Nullable: unset
    # until the first time it's computed, either by the background
    # prewarm task right after submission or on first view.
    narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bank: Mapped["Bank"] = relationship()
    answers: Mapped[List["Answer"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )
    dimension_scores: Mapped[List["DimensionScore"]] = relationship(
        back_populates="assessment", cascade="all, delete-orphan"
    )


class Answer(Base):
    """A single Likert response (1–5) to one question within an assessment."""

    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True
    )
    # A historical key, not a live pointer: deliberately *not* a foreign key.
    # The question this answers is read from the frozen snapshot of the
    # assessment's version (see app.services.questionnaire_reference), so the
    # live `questions` row is free to be deleted when a later version drops it.
    # Without this, the framework could only ever deactivate questions, and
    # every question ever asked would accumulate in the live tables for ever.
    question_id: Mapped[int] = mapped_column(Integer, index=True)
    value: Mapped[int] = mapped_column(Integer)

    assessment: Mapped["Assessment"] = relationship(back_populates="answers")


class DimensionScore(Base):
    """Cached per-dimension score for an assessment (mean of its answers)."""

    __tablename__ = "dimension_scores"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True
    )
    # Same as Answer.question_id: a key into the assessment's frozen snapshot,
    # not a foreign key into the live framework.
    dimension_id: Mapped[int] = mapped_column(Integer, index=True)
    score: Mapped[float] = mapped_column(Float)

    assessment: Mapped["Assessment"] = relationship(back_populates="dimension_scores")


class AssessmentRecommendationPlan(Base):
    """Persisted cache of an assessment's default (Scenario 1) recommendation
    plan -- the LLM-reformulated recommendations shown on the
    Recommendations page.

    Computed once (by the background prewarm task right after submission,
    or on first view if that hasn't finished yet), then always served from
    here afterwards. Without this, revisiting an old assessment's
    recommendations (e.g. from Historique) would pay for the slow LLM
    reformulation again every time: the in-memory response cache in
    ``llm.generation`` only helps within a single running process and is
    lost on every restart, but this table survives both.
    """

    __tablename__ = "assessment_recommendation_plans"

    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), primary_key=True
    )
    # Shaped exactly like RecommendationPlanOut (plan_prioritaire /
    # recommandations_completes / notes_dimensions) so it can be loaded
    # straight back into that schema with no transformation.
    plan: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
