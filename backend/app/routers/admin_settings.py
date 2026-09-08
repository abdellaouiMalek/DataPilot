"""Platform settings, only the ones with something real behind them.

Two sections, two different sources of truth, on purpose:

* **Sécurité** is stored by Keycloak on the realm. It is read and written
  there rather than mirrored locally, because a local copy is the version
  that silently goes stale while the realm keeps deciding the behaviour.
* **Notifications** are the application's own decision, so they live in
  ``platform_settings``.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.core.keycloak_admin import kc_get, kc_put
from app.core.mailer import SMTP_PASSWORD, SMTP_USER
from app.db.database import get_db
from app.models import PlatformSettings
from app.models.audit_log import MODULE_SETTINGS
from app.schemas.admin_settings import (
    NotificationSettings,
    SecuritySettings,
    SettingsRead,
    SettingsUpdate,
)
from app.services.audit import Audit, audit_context, summarize_changes

router = APIRouter(
    prefix="/api/super-admin/settings",
    tags=["super-admin-settings"],
    dependencies=[Depends(require_super_admin)],
)

# Keycloak's required action that asks a user to enrol a second factor.
TOTP_ACTION = "CONFIGURE_TOTP"

# The password-policy term Keycloak uses for "expire after N days". The realm
# policy is a single string of several terms, so it is edited surgically, 
# rewriting the whole thing would silently drop length/complexity rules an
# operator set directly in Keycloak.
EXPIRY_TERM = "forceExpiredPasswordChange"
EXPIRY_RE = re.compile(rf"{EXPIRY_TERM}\(\s*(\d+)\s*\)")

# Field -> French label, for the "avant → après" text in the audit trail.
SETTING_FIELD_LABELS = {
    "two_factor_required": "Double authentification",
    "session_idle_minutes": "Expiration de session (min)",
    "password_expiry_days": "Expiration des mots de passe (j)",
    "notify_email": "Email de notification",
    "notify_on_assessment": "Notifier à la soumission d'une évaluation",
    "notify_on_new_user": "Notifier à la création de compte",
}


# ── Keycloak realm ────────────────────────────────────────────────────────────


def _expiry_from_policy(policy: Optional[str]) -> Optional[int]:
    match = EXPIRY_RE.search(policy or "")
    return int(match.group(1)) if match else None


def _policy_with_expiry(policy: Optional[str], days: Optional[int]) -> str:
    """Set, replace or drop the expiry term while leaving every other term be."""
    terms = [
        term.strip()
        for term in (policy or "").split(" and ")
        if term.strip() and EXPIRY_TERM not in term
    ]
    if days is not None:
        terms.append(f"{EXPIRY_TERM}({days})")
    return " and ".join(terms)


async def _totp_action() -> dict[str, Any]:
    return await kc_get(f"/authentication/required-actions/{TOTP_ACTION}")


def _read_security(realm: dict[str, Any], totp: dict[str, Any]) -> SecuritySettings:
    return SecuritySettings(
        two_factor_required=bool(totp.get("defaultAction", False)),
        # Keycloak stores seconds; the page talks in minutes.
        session_idle_minutes=max(1, int(realm.get("ssoSessionIdleTimeout") or 0) // 60),
        password_expiry_days=_expiry_from_policy(realm.get("passwordPolicy")),
    )


async def _write_security(realm: dict[str, Any], wanted: SecuritySettings) -> None:
    # The whole realm representation is sent back, as Keycloak expects a full
    # object here; mutating the one we just read keeps every other setting.
    realm["ssoSessionIdleTimeout"] = wanted.session_idle_minutes * 60
    realm["passwordPolicy"] = _policy_with_expiry(
        realm.get("passwordPolicy"), wanted.password_expiry_days
    )
    await kc_put("", realm)

    totp = await _totp_action()
    if bool(totp.get("defaultAction", False)) != wanted.two_factor_required:
        totp["defaultAction"] = wanted.two_factor_required
        # Enabling the action is a precondition for making it a default one.
        if wanted.two_factor_required:
            totp["enabled"] = True
        await kc_put(f"/authentication/required-actions/{TOTP_ACTION}", totp)


# ── Settings row ──────────────────────────────────────────────────────────────


async def _settings_row(db: AsyncSession) -> PlatformSettings:
    row = await db.get(PlatformSettings, 1)
    if row is None:
        # The migration seeds it; recreate rather than 500 if it was removed.
        row = PlatformSettings(id=1)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _read_notifications(row: PlatformSettings) -> NotificationSettings:
    return NotificationSettings(
        notify_email=row.notify_email,
        notify_on_assessment=row.notify_on_assessment,
        notify_on_new_user=row.notify_on_new_user,
    )


async def _compose(db: AsyncSession) -> SettingsRead:
    realm, totp = await kc_get(""), await _totp_action()
    row = await _settings_row(db)
    return SettingsRead(
        security=_read_security(realm, totp),
        notifications=_read_notifications(row),
        smtp_configured=bool(SMTP_USER and SMTP_PASSWORD),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=SettingsRead)
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await _compose(db)


@router.put("", response_model=SettingsRead)
async def update_settings(
    payload: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    realm = await kc_get("")
    totp = await _totp_action()
    row = await _settings_row(db)

    previous: dict[str, Any] = {
        **_read_security(realm, totp).model_dump(),
        **_read_notifications(row).model_dump(),
    }

    if payload.security is not None:
        await _write_security(realm, payload.security)

    if payload.notifications is not None:
        wanted = payload.notifications
        if (
            wanted.notify_on_assessment or wanted.notify_on_new_user
        ) and not wanted.notify_email:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Renseignez une adresse de réception avant d'activer "
                    "les notifications."
                ),
            )
        row.notify_email = str(wanted.notify_email) if wanted.notify_email else None
        row.notify_on_assessment = wanted.notify_on_assessment
        row.notify_on_new_user = wanted.notify_on_new_user
        row.updated_by_name = audit.actor_name
        await db.commit()

    result = await _compose(db)
    current = {
        **result.security.model_dump(),
        **result.notifications.model_dump(),
    }
    before, after, fields = summarize_changes(previous, current, SETTING_FIELD_LABELS)
    if fields:
        await audit.record(
            module=MODULE_SETTINGS,
            action="Modification des paramètres de la plateforme",
            entity_type="settings",
            before=before,
            after=after,
            details={"champs": fields},
        )
    return result
