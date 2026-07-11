"""One-shot Keycloak bootstrap for fresh installs.

The realm import file recreates users/roles/clients, but Keycloak's exporter
does NOT carry two settings the app depends on. This script (re)applies them
via the Admin API using the imported ``datapilot-backend`` service account
(which holds ``manage-realm``):

1. ``unmanagedAttributePolicy = ENABLED`` — without it, Keycloak silently
   strips the custom user attributes the admin module relies on
   (``archived``, ``organization``).
2. Realm SMTP — copied from the ``SMTP_*`` vars in ``backend/.env`` so
   Keycloak's own email flows work too. Skipped if no SMTP creds are set.

Idempotent: safe to run any number of times.

Usage (from ``backend/``, after ``docker compose up -d``):

    python -m app.keycloak_bootstrap
"""

from __future__ import annotations

import asyncio

from app.core.keycloak_admin import kc_get, kc_put
from app.core.mailer import (
    SMTP_FROM_NAME,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
)


async def ensure_unmanaged_attributes() -> None:
    profile = await kc_get("/users/profile")
    if profile.get("unmanagedAttributePolicy") == "ENABLED":
        print("- unmanaged attributes: already ENABLED")
        return
    profile["unmanagedAttributePolicy"] = "ENABLED"
    await kc_put("/users/profile", profile)
    print("- unmanaged attributes: set to ENABLED")


async def ensure_login_events() -> None:
    """Enable login-event storage (needed for the "Dernière connexion" column)."""
    realm = await kc_get("")
    if realm.get("eventsEnabled"):
        print("- login events: already enabled")
        return
    realm["eventsEnabled"] = True
    realm["eventsExpiration"] = 90 * 24 * 3600  # keep 90 days of events
    await kc_put("", realm)
    print("- login events: enabled (90 days retention)")


async def ensure_realm_smtp() -> None:
    if not (SMTP_USER and SMTP_PASSWORD):
        print("- realm SMTP: skipped (no SMTP_USER/SMTP_PASSWORD in backend/.env)")
        return

    realm = await kc_get("")
    current = realm.get("smtpServer") or {}
    if current.get("host"):
        print(f"- realm SMTP: already configured (host {current['host']})")
        return

    realm["smtpServer"] = {
        "host": SMTP_HOST,
        "port": str(SMTP_PORT),
        "from": SMTP_USER,
        "fromDisplayName": SMTP_FROM_NAME,
        "starttls": "true",
        "ssl": "false",
        "auth": "true",
        "user": SMTP_USER,
        "password": SMTP_PASSWORD,
    }
    await kc_put("", realm)
    print(f"- realm SMTP: configured ({SMTP_HOST}, from {SMTP_USER})")


async def main() -> None:
    print("Bootstrapping Keycloak realm settings…")
    await ensure_unmanaged_attributes()
    await ensure_login_events()
    await ensure_realm_smtp()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
