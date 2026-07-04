from __future__ import annotations

from typing import List

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


class SubDimension(Base):
    """A grouping of questions inside a dimension. Admin-managed."""

    __tablename__ = "sub_dimensions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    dimension_id: Mapped[int] = mapped_column(
        ForeignKey("dimensions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    dimension: Mapped["Dimension"] = relationship(back_populates="sub_dimensions")
    questions: Mapped[List["Question"]] = relationship(
        back_populates="subdimension",
        cascade="all, delete-orphan",
        order_by="Question.sort_order",
    )
