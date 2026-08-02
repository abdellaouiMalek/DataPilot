from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.database import Base


class RegulatoryCircular(Base):
    """A regulatory circular (e.g. from the Banque Centrale de Tunisie)
    imported for review under "Veille réglementaire". Admin-managed:
    imported (file or URL), its impacts triaged, then published.
    """

    __tablename__ = "regulatory_circulars"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    reference: Mapped[str] = mapped_column(String(200))
    publication_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    theme: Mapped[str] = mapped_column(String(300), default="", server_default="")
    status: Mapped[str] = mapped_column(
        String(20), default="En vigueur", server_default="En vigueur"
    )
    version: Mapped[str] = mapped_column(String(20), default="v1", server_default="v1")
    source_filename: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    published_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    impacts: Mapped[List["RegulatoryImpact"]] = relationship(
        back_populates="circular",
        cascade="all, delete-orphan",
        order_by="RegulatoryImpact.id",
    )

    # Plain @property (not mapped_column): read off the already-loaded
    # `impacts` relationship so CircularRead.model_validate(circular) can
    # pick them up via from_attributes without a separate COUNT query.
    @property
    def impact_count(self) -> int:
        return len(self.impacts)

    @property
    def pending_count(self) -> int:
        return sum(1 for i in self.impacts if i.action is None)


class RegulatoryImpact(Base):
    """One candidate requirement extracted from a circular. An admin
    accepts, edits, or rejects it before the circular is published --
    this is a review queue, not an automatic write to the framework."""

    __tablename__ = "regulatory_impacts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    circular_id: Mapped[int] = mapped_column(
        ForeignKey("regulatory_circulars.id", ondelete="CASCADE"), index=True
    )
    requirement_text: Mapped[str] = mapped_column(Text)
    # "réglementaire" | "nouvelle question" | "recommandation"
    target_type: Mapped[str] = mapped_column(String(30))
    target_description: Mapped[str] = mapped_column(String(300), default="", server_default="")
    # "accepté" | "modifié" | "rejeté" | null (still pending review)
    action: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # The admin's edited wording, only set when action == "modifié".
    edited_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    circular: Mapped["RegulatoryCircular"] = relationship(back_populates="impacts")
