from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class MaturityLevel(Base):
    """A maturity band (Initial, Reproductible, …) mapped to a score range.

    A global/dimension score falls into the band whose
    ``min_score <= score <= max_score``. Admin-managed.
    """

    __tablename__ = "maturity_levels"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    label: Mapped[str] = mapped_column(String(50))
    min_score: Mapped[float] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float)
    color: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
