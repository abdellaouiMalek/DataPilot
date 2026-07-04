from __future__ import annotations

from typing import List

from sqlalchemy import Boolean, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Dimension(Base):
    """One of the maturity axes (Gouvernance, Qualité, …). Admin-managed."""

    __tablename__ = "dimensions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Stable slug used by the public questionnaire / scoring (e.g. "gouvernance").
    # Auto-generated from the name on create.
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(10))  # display code e.g. "01"
    name: Mapped[str] = mapped_column(String(200))
    short_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[float] = mapped_column(Float, default=0, server_default="0")
    color: Mapped[str] = mapped_column(String(20), default="#1A1A1A", server_default="#1A1A1A")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    sub_dimensions: Mapped[List["SubDimension"]] = relationship(
        back_populates="dimension",
        cascade="all, delete-orphan",
        order_by="SubDimension.sort_order",
    )

    # Flat, read-only view of all questions in this dimension (via Question.dimension_id).
    # Used by the public /api/dimensions endpoint; writes go through sub-dimensions.
    questions: Mapped[List["Question"]] = relationship(
        viewonly=True,
        order_by="Question.sort_order",
    )
