"""Audit trail for administrative actions.

Every mutation performed from the back-office writes one row here, which is
what the "Historique & logs" page reads. The table is append-only by
convention: nothing in the app updates or deletes a row, so the trail stays
usable as evidence of who changed what.

The shape is deliberately denormalized. ``actor_name`` is copied in rather
than joined at read time because users live in Keycloak, not in this
database -- a deleted account must not blank out the history it produced.
Same reasoning for ``entity_label``: the dimension or bank a row refers to
may be gone by the time anyone reads the log.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base

# Functional area an entry belongs to -- these are the module chips the
# back-office filters on, so the strings are the French labels the UI shows.
MODULE_FRAMEWORK = "Framework"
MODULE_VERSIONS = "Versions"
MODULE_USERS = "Utilisateurs"
MODULE_BANKS = "Banques"
MODULE_SCORING = "Scoring"
MODULE_ASSESSMENTS = "Évaluations"
MODULE_SETTINGS = "Paramètres"

MODULES = [
    MODULE_FRAMEWORK,
    MODULE_VERSIONS,
    MODULE_USERS,
    MODULE_BANKS,
    MODULE_SCORING,
    MODULE_ASSESSMENTS,
    MODULE_SETTINGS,
]

STATUS_SUCCESS = "Succès"
STATUS_FAILURE = "Échec"
STATUS_WARNING = "Avertissement"

STATUSES = [STATUS_SUCCESS, STATUS_FAILURE, STATUS_WARNING]


class AuditLog(Base):
    """One recorded administrative action."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    # Actor, snapshotted from the Keycloak token claims at write time.
    actor_sub: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(200), default="", server_default="")
    actor_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    module: Mapped[str] = mapped_column(String(50), index=True)
    # Human-readable summary shown as the entry's title
    # ("Publication questionnaire v2.1").
    action: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(
        String(20), default=STATUS_SUCCESS, server_default=STATUS_SUCCESS, index=True
    )

    # What was acted on. ``entity_id`` is a string because users are
    # identified by a Keycloak UUID while everything else uses an int PK.
    entity_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    entity_label: Mapped[str] = mapped_column(String(300), default="", server_default="")

    # Short strings rendered in the "avant → après" pill. Empty means the
    # action has no meaningful before state (a creation, typically).
    before: Mapped[str] = mapped_column(String(500), default="", server_default="")
    after: Mapped[str] = mapped_column(String(500), default="", server_default="")
    # Free-form extra context for the expanded detail panel (changed field
    # names, counts, the rejection reason on a failure…).
    details: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)

    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
