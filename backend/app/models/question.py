from __future__ import annotations

from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

DEFAULT_QUESTION_TYPE = "Échelle de maturité"


class Question(Base):
    """A questionnaire item belonging to a sub-dimension. Admin-managed.

    ``dimension_id`` is kept denormalized (always = the sub-dimension's dimension)
    so the public flat questionnaire view stays a simple dimension→questions read.
    """

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    dimension_id: Mapped[int] = mapped_column(
        ForeignKey("dimensions.id", ondelete="CASCADE"), index=True
    )
    sub_dimension_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("sub_dimensions.id", ondelete="CASCADE"), index=True, nullable=True
    )
    text: Mapped[str] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(
        String(50), default=DEFAULT_QUESTION_TYPE, server_default=DEFAULT_QUESTION_TYPE
    )
    weight: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Per-level label + point overrides for "Échelle de maturité" questions, e.g.
    # [{"label": "...", "score": 1}, ...] — index i = level i+1. Null = defaults.
    level_responses: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    # Options for "Choix unique" / "Choix multiple" questions, e.g.
    # [{"label": "...", "score": 3}, ...]. Null/empty for other question types.
    choice_options: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    subdimension: Mapped[Optional["SubDimension"]] = relationship(
        back_populates="questions"
    )
