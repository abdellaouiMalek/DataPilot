from __future__ import annotations

from typing import List

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class Dimension(Base):
    """One of the maturity axes (Gouvernance, Qualité, …). Admin-managed."""

    __tablename__ = "dimensions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    # Stable slug used by the frontend / scoring (e.g. "gouvernance").
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    code: Mapped[str] = mapped_column(String(10))  # display code e.g. "01"
    name: Mapped[str] = mapped_column(String(200))
    short_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    questions: Mapped[List["Question"]] = relationship(
        back_populates="dimension",
        cascade="all, delete-orphan",
        order_by="Question.sort_order",
    )
