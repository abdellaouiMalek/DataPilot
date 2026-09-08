"""The signed-in administrator's own account, as the back-office sees it.

Deliberately *not* a second copy of ``/api/profile``: editing one's name or
email still goes through that endpoint, which every authenticated user shares.
What lives here is the part only a back-office account has, when it last
signed in, and what it has actually done to the platform, read back from the
audit trail by Keycloak ``sub`` so a rename never detaches an admin from their
own history.

The password reset is self-service on purpose. ``admin_users`` can already
reset *other* people's passwords, but an administrator resetting their own
through that route would be acting on themselves via a user-management screen;
having it here keeps "my account" and "other people's accounts" separate.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_back_office
from app.core.keycloak_admin import kc_get
from app.db.database import get_db
from app.models import AuditLog
from app.models.audit_log import MODULE_USERS
from app.routers.admin_users import (
    _email_credentials,
    _set_temp_password,
    _user_role,
)
from app.schemas.admin_profile import (
    AdminProfileOverview,
    PasswordResetResult,
    ProfileActivityItem,
)
from app.services.audit import Audit, audit_context

# Les deux rôles back-office ont un compte : `super_admin` et `admin`. Le
# préfixe n'est donc plus sous /super-admin -- un administrateur restreint doit
# pouvoir consulter et modifier le sien, ce que `require_super_admin` lui
# refusait alors que la page le lui proposait.
router = APIRouter(
    prefix="/api/back-office/profile",
    tags=["back-office-profile"],
    dependencies=[Depends(require_back_office)],
)

RECENT_ACTIONS = 6
ACTIVITY_WINDOW_DAYS = 30


def _sub(claims: dict[str, Any]) -> str:
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Jeton utilisateur invalide.")
    return user_id


def _created_at(user: dict[str, Any]) -> Optional[datetime]:
    stamp = user.get("createdTimestamp")
    if stamp is None:
        return None
    return datetime.fromtimestamp(stamp / 1000, tz=timezone.utc)


async def _last_login(user_id: str) -> Optional[datetime]:
    """Most recent LOGIN event for this account.

    Degrades to None rather than failing the page: the event log needs
    ``eventsEnabled`` on the realm and ``view-events`` on the service account,
    and events expire, so "unknown" is a normal answer here.
    """
    try:
        events = await kc_get(
            "/events", {"type": "LOGIN", "user": user_id, "max": 1}
        )
    except HTTPException:
        return None
    for event in events:
        stamp = event.get("time")
        if stamp:
            return datetime.fromtimestamp(stamp / 1000, tz=timezone.utc)
    return None


@router.get("", response_model=AdminProfileOverview)
async def get_overview(
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
):
    user_id = _sub(claims)
    user = await kc_get(f"/users/{user_id}")

    since = datetime.now(timezone.utc) - timedelta(days=ACTIVITY_WINDOW_DAYS)
    mine = select(AuditLog).where(AuditLog.actor_sub == user_id)

    actions_total = (
        await db.scalar(select(func.count()).select_from(mine.subquery())) or 0
    )
    actions_recent = (
        await db.scalar(
            select(func.count())
            .select_from(mine.where(AuditLog.created_at >= since).subquery())
        )
        or 0
    )
    last_action_at = await db.scalar(
        select(func.max(AuditLog.created_at)).where(AuditLog.actor_sub == user_id)
    )
    recent = (
        (
            await db.execute(
                mine.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(
                    RECENT_ACTIONS
                )
            )
        )
        .scalars()
        .all()
    )

    return AdminProfileOverview(
        id=user_id,
        username=user.get("username"),
        email=user.get("email"),
        # Read from Keycloak rather than from the token: a role granted since
        # this session started would otherwise not show until the next login.
        role=await _user_role(user_id),
        email_verified=bool(user.get("emailVerified", False)),
        created_at=_created_at(user),
        last_login=await _last_login(user_id),
        actions_total=actions_total,
        actions_30d=actions_recent,
        last_action_at=last_action_at,
        recent_actions=[ProfileActivityItem.model_validate(row) for row in recent],
    )


@router.post("/password", response_model=PasswordResetResult)
async def reset_own_password(
    claims: dict = Depends(require_back_office),
    audit: Audit = Depends(audit_context),
):
    """Send oneself a temporary password, to be changed at the next sign-in.

    Same mechanism the users page uses on someone else (Keycloak cannot mail a
    password itself, so the backend does), pointed at the caller. The password
    is never returned in the response nor written to the trail, only the fact
    that a reset was requested.
    """
    user_id = _sub(claims)
    user = await kc_get(f"/users/{user_id}")
    email = user.get("email")
    if not email:
        raise HTTPException(
            status_code=400,
            detail=(
                "Votre compte n'a pas d'adresse email : impossible d'envoyer "
                "le mot de passe temporaire."
            ),
        )

    temp_password = await _set_temp_password(user_id)
    await _email_credentials(
        email, user.get("firstName") or "", temp_password, created=False
    )
    await audit.record(
        module=MODULE_USERS,
        action="Réinitialisation de son propre mot de passe",
        entity_type="user",
        entity_id=user_id,
        entity_label=email,
        after=f"Mot de passe temporaire envoyé à {email}",
    )
    return PasswordResetResult(sent=True, email=email)
