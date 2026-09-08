"""Recording of back-office actions into the audit trail.

Endpoints don't build ``AuditLog`` rows themselves: they take an ``Audit``
dependency and call ``await audit.record(db, module=…, action=…)`` once the
mutation succeeded. The dependency carries the caller's identity (from the
verified Keycloak token) and the request metadata, so a handler only has to
say *what* happened.

Writes go on their own session, after the business commit. That isolation is
deliberate: an audit row is evidence that something happened, so it must never
be the reason a legitimate admin action fails. Borrowing the request's session
would break that -- a failed insert has to be rolled back, and a rollback
expires every object the handler still holds, so the response would blow up
while being serialized. If the write fails we log it loudly and let the
request succeed.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import Depends, Request

from app.core.auth import verify_token
from app.db.database import AsyncSessionLocal
from app.models.audit_log import (
    AuditLog,
    STATUS_FAILURE,
    STATUS_SUCCESS,
    STATUS_WARNING,
)

logger = logging.getLogger(__name__)

__all__ = [
    "Audit",
    "audit_context",
    "summarize_changes",
    "STATUS_SUCCESS",
    "STATUS_FAILURE",
    "STATUS_WARNING",
]


def _actor_name(claims: dict) -> str:
    """Best display name the token offers, in decreasing order of niceness."""
    for key in ("name", "preferred_username", "email"):
        value = (claims.get(key) or "").strip()
        if value:
            return value
    return "Utilisateur inconnu"


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    # Behind the compose reverse proxy the socket peer is the proxy itself,
    # so prefer the forwarded chain's first hop when present.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host[:64] if request.client else None


class Audit:
    """Per-request recorder handed to endpoints as a dependency."""

    def __init__(self, claims: dict, request: Optional[Request] = None):
        self.claims = claims or {}
        self.request = request

    @property
    def actor_name(self) -> str:
        """Display name of whoever is performing the action."""
        return _actor_name(self.claims)

    @property
    def actor_email(self) -> Optional[str]:
        """Address of whoever is performing the action, when the token says."""
        return self.claims.get("email")

    async def record(
        self,
        *,
        module: str,
        action: str,
        status: str = STATUS_SUCCESS,
        entity_type: Optional[str] = None,
        entity_id: Optional[Any] = None,
        entity_label: str = "",
        before: str = "",
        after: str = "",
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        entry = AuditLog(
            actor_sub=self.claims.get("sub"),
            actor_name=_actor_name(self.claims),
            actor_email=self.claims.get("email"),
            module=module,
            action=action[:300],
            status=status,
            entity_type=entity_type,
            entity_id=None if entity_id is None else str(entity_id)[:255],
            entity_label=(entity_label or "")[:300],
            before=(before or "")[:500],
            after=(after or "")[:500],
            details=details,
            ip=_client_ip(self.request),
            user_agent=(
                self.request.headers.get("user-agent", "")[:400]
                if self.request is not None
                else None
            ),
        )
        try:
            async with AsyncSessionLocal() as session:
                session.add(entry)
                await session.commit()
        except Exception:  # pragma: no cover - defensive, see module docstring
            logger.exception("Failed to write audit log entry: %s / %s", module, action)


async def audit_context(
    request: Request, claims: dict = Depends(verify_token)
) -> Audit:
    """FastAPI dependency: ``audit: Audit = Depends(audit_context)``."""
    return Audit(claims, request)


def summarize_changes(
    old: dict[str, Any],
    new: dict[str, Any],
    labels: dict[str, str],
) -> tuple[str, str, list[str]]:
    """Turn a field-level diff into the strings the log entry displays.

    Returns ``(before, after, changed_fields)`` where the first two are the
    compact "avant → après" pill text and the third feeds the expanded detail
    panel. Only keys present in ``new`` and actually different are reported,
    so a PATCH that resends unchanged fields doesn't produce noise.
    """
    changed = [
        key
        for key, value in new.items()
        if key in labels and old.get(key) != value
    ]
    if not changed:
        return "", "", []

    def fmt(source: dict[str, Any]) -> str:
        return ", ".join(f"{labels[k]} : {_fmt_value(source.get(k))}" for k in changed)

    return fmt(old), fmt(new), [labels[k] for k in changed]


def _fmt_value(value: Any) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, bool):
        return "oui" if value else "non"
    if isinstance(value, float):
        return f"{value:g}"
    text = str(value)
    return text if len(text) <= 60 else text[:57] + "…"
