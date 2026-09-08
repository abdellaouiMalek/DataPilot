from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.storage import logo_url as _logo_url
from app.db.database import Base


class Bank(Base):
    """A client bank: shown in the landing-page selector and managed in the
    admin back-office. ``is_active`` = enabled/disabled (hidden from the public
    selector when off); ``archived`` = end-of-life, hidden from the default
    admin list too. Assessments reference banks by id.
    """

    __tablename__ = "banks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    country: Mapped[str] = mapped_column(String(100), default="", server_default="")
    sector: Mapped[str] = mapped_column(String(200), default="", server_default="")
    contact: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Filename only (e.g. "12.png"), relative to app/static/logos -- see
    # app.core.storage. Nullable: most banks won't have one uploaded yet.
    logo_path: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    @property
    def logo_url(self) -> Optional[str]:
        """Public URL for the logo, or None. Computed rather than stored so
        the URL scheme can change without a migration."""
        return _logo_url(self.logo_path)


class Department(Base):
    """Department offered in the landing-page selector. Admin-managed."""

    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Role(Base):
    """Evaluator role/title offered in the landing-page selector. Admin-managed."""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
