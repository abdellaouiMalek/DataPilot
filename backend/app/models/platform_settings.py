"""Platform-level preferences that have nowhere else to live.

Deliberately small. Anything Keycloak already owns, session lifetimes,
password policy, required actions, is read from and written to the realm
rather than mirrored here, because a copy would be the version that goes
stale. What lands in this table is only what the application itself decides:
today, who gets notified about what.

Single row by design (``id`` is always 1), like ``framework_drafts``: there is
one platform, so there is one set of preferences.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.database import Base


class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)

    # Where administrative notifications are sent. Null = notifications are
    # configured but have no recipient, which the API treats as "off" rather
    # than guessing an address.
    notify_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Submissions come from respondents, never from the back-office, which is
    # the whole point: a notification about something you did yourself is noise.
    notify_on_assessment: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    notify_on_new_user: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    updated_by_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
