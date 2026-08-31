"""Schemas for the Paramètres page.

Only settings with something real behind them are modelled here. Security
lives in the Keycloak realm, notifications in ``platform_settings``, and the
access tiers are read back out of the running application rather than
declared — see ``app.routers.admin_settings``.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class SecuritySettings(BaseModel):
    """Authentication settings, stored by Keycloak on the realm itself."""

    #: CONFIGURE_TOTP as a default required action: every account is asked to
    #: set up a second factor at its next sign-in. Realm-wide — Keycloak has no
    #: per-role default action.
    two_factor_required: bool
    #: Realm ``ssoSessionIdleTimeout``, in minutes.
    session_idle_minutes: int = Field(ge=1, le=10080)
    #: ``forceExpiredPasswordChange(N)`` in the realm password policy.
    #: None means no expiry rule is set.
    password_expiry_days: Optional[int] = Field(default=None, ge=1, le=3650)


class NotificationSettings(BaseModel):
    """Administrative emails the platform sends itself."""

    #: None disables every notification: there is nowhere to send them, and
    #: guessing an address would be worse than sending nothing.
    notify_email: Optional[EmailStr]
    notify_on_assessment: bool
    notify_on_new_user: bool


class SettingsRead(BaseModel):
    security: SecuritySettings
    notifications: NotificationSettings
    #: False when SMTP is not configured on the backend: notifications can be
    #: switched on but nothing would leave the server, so the page says so.
    smtp_configured: bool


class SettingsUpdate(BaseModel):
    """Partial update — only the sections the page actually edited."""

    security: Optional[SecuritySettings] = None
    notifications: Optional[NotificationSettings] = None
