from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base


class Notification(Base):
    """An in-app notification for a back-office user.

    Recipients are identified by ``user_id`` (the Keycloak ``sub`` claim,
    a UUID string) rather than a foreign key -- identity lives entirely in
    Keycloak in this app (no local users table, see
    ``app.routers.admin_users``), so a Keycloak user id is the only stable
    reference available.

    First (and currently only) producer: publishing a "Veille
    réglementaire" update fans out one row per ``admin``-role user (see
    ``app.services.notifications.notify_admins_of_publication``) -- kept
    generic (``type``/``title``/``message``) rather than
    publication-specific, so a future notification source can reuse the
    same table without a schema change.
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    # "info" | "success" | "warning" -- matches the frontend's icon/color
    # mapping (NotificationsPanel.iconMap), never rendered raw otherwise.
    type: Mapped[str] = mapped_column(String(20), default="info", server_default="info")
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # Optional deep link to the circular that caused this notification
    # (nullable: kept generic for future non-regulatory notification
    # sources). No ORM relationship/cascade on purpose -- a notification
    # must survive its source circular being referenced elsewhere or ever
    # needing independent cleanup; it's a historical record, not a live
    # view of the circular.
    circular_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("regulatory_circulars.id", ondelete="SET NULL"), nullable=True
    )
