from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base


class FrameworkDraft(Base):
    """The framework edits an admin has staged but not published yet.

    Editing the framework is a long, deep operation (dimensions →
    sub-dimensions → questions, with weights and per-level responses), so the
    admin page batches every change locally and pushes the whole pending tree
    here as it goes. Nothing in this row affects respondents: the questionnaire
    keeps reading the live ``dimensions`` / ``questions`` tables until the
    draft is published.

    Single row by design (``id`` is always 1): the framework has one pending
    state, shared by whoever is editing it — hence ``updated_by_name``, so a
    second admin sees who has work in flight instead of silently overwriting it.
    """

    __tablename__ = "framework_drafts"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    # Same shape as the publish payload: [{dimension, sub_dimensions:[{questions:[…]}]}].
    tree: Mapped[dict] = mapped_column(JSONB)
    # Version this draft was started from, so publishing can detect that
    # someone else published in the meantime.
    base_version_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    updated_by_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    updated_by_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class QuestionnaireVersion(Base):
    """An immutable snapshot of the framework, written on publish.

    ``snapshot`` freezes the whole tree as it was at publish time so an
    assessment can always be read back against the questionnaire it was
    actually answered on, even after the live framework moves on. ``changelog``
    holds the computed diff against the previous version (see
    app.services.framework_publish) plus the admin's optional note.
    """

    __tablename__ = "questionnaire_versions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Sequential, assigned server-side: v1, v2, … (displayed as "v{number}").
    number: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    # The version currently applied to the live framework tables. Usually the
    # newest, but restoring an older one moves the flag back to it rather than
    # rewriting history -- exactly one row is true (enforced by a partial
    # unique index, see the migration).
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", index=True
    )
    # End-of-life marker: the row and its snapshot stay (assessments may point
    # at them), it just drops out of the log's default view. A check constraint
    # keeps it mutually exclusive with ``is_active`` -- what people are
    # answering right now can never be presented as retired.
    archived: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    # Optional human label typed at publish time ("Édition 2026").
    label: Mapped[str] = mapped_column(String(200), default="", server_default="")
    # Free-text note the admin adds on top of the computed diff.
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    # [{kind: "question.updated", label: "...", details: ["poids 5 → 8"]}, …]
    changelog: Mapped[list] = mapped_column(JSONB, default=list)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    dimension_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
