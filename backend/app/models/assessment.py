from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
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

    score_global: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maturity_label: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

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
    # RESTRICT: a question that has answers can't be hard-deleted — admins
    # deactivate it (is_active=False) instead, preserving historical data.
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="RESTRICT"), index=True
    )
    value: Mapped[int] = mapped_column(Integer)

    assessment: Mapped["Assessment"] = relationship(back_populates="answers")


class DimensionScore(Base):
    """Cached per-dimension score for an assessment (mean of its answers)."""

    __tablename__ = "dimension_scores"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    assessment_id: Mapped[int] = mapped_column(
        ForeignKey("assessments.id", ondelete="CASCADE"), index=True
    )
    dimension_id: Mapped[int] = mapped_column(
        ForeignKey("dimensions.id", ondelete="RESTRICT"), index=True
    )
    score: Mapped[float] = mapped_column(Float)

    assessment: Mapped["Assessment"] = relationship(back_populates="dimension_scores")
