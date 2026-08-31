from __future__ import annotations

from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Recommendation(Base):
    """One atomic recommendation: moves a single question's answer from
    ``trigger_level`` to ``trigger_level + 1``. Admin-managed catalog consumed
    by the recommendation engine once an assessment is scored.
    """

    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Widened from 20: a draft row's code is "DRAFT-{draft_question_key}-{level}"
    # (see app/routers/admin.py::create_recommendations), and draft_question_key
    # (String(80)) is realistically ~42 chars ("new-q-<uuid>") -- "DRAFT-" + 42 +
    # "-" + 1 digit = 50 chars. 100 leaves headroom, matching the same buffer
    # ratio draft_question_key itself uses (80 for a ~42-char actual value).
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # e.g. "D1Q1-1" or "DRAFT-<key>-1"
    # Nullable: a draft recommendation (see draft_question_key below) has no
    # real question yet. Exactly one of question_id / draft_question_key is
    # ever set -- enforced by chk_question_or_draft.
    question_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Set only while the question this recommendation targets is still
    # sitting in the framework draft (not yet published) -- holds the same
    # temp id string the draft's tree uses for that question node (see
    # frontend/src/pages/superAdmin/frameworkStaging.tsx's newId()). Cleared
    # (and question_id populated) once the framework is published; see
    # app/services/framework_publish.py::promote_draft_recommendations.
    draft_question_key: Mapped[Optional[str]] = mapped_column(
        String(80), nullable=True, index=True
    )
    trigger_level: Mapped[int] = mapped_column(Integer)
    target_level: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    recommendation_text: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50))
    regulatory_flag: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    effort: Mapped[int] = mapped_column(Integer)
    prerequisite_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("recommendations.id"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    question: Mapped["Question"] = relationship()

    __table_args__ = (
        UniqueConstraint("question_id", "trigger_level", name="uq_question_trigger"),
        CheckConstraint("trigger_level BETWEEN 1 AND 4", name="chk_trigger_level_range"),
        CheckConstraint("target_level BETWEEN 2 AND 5", name="chk_target_level_range"),
        CheckConstraint("target_level = trigger_level + 1", name="chk_one_step"),
        CheckConstraint("effort BETWEEN 1 AND 3", name="chk_effort_range"),
        CheckConstraint(
            "(question_id IS NOT NULL) != (draft_question_key IS NOT NULL)",
            name="chk_question_or_draft",
        ),
        Index(
            "uq_draft_question_trigger", "draft_question_key", "trigger_level",
            unique=True, postgresql_where=text("draft_question_key IS NOT NULL"),
        ),
    )
