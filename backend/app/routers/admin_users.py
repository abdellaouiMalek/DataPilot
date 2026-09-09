"""Admin user-management endpoints, proxying the Keycloak Admin REST API.

Identity lives entirely in Keycloak (no local users table). Business roles are
Keycloak realm roles; the UI's French labels map 1:1 to them. Passwords are
never seen by the admin: creation and reset generate a random temporary
password (``temporary: true`` forces a change at first login) that the backend
emails directly to the user, Keycloak itself cannot email passwords, so the
mail goes out via ``app.core.mailer``.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import string
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_bank_scope, is_super_admin, require_back_office
from app.core.keycloak_admin import kc_delete, kc_get, kc_post, kc_put
from app.core.mailer import send_email
from app.db.database import get_db
from app.models import Bank
from app.models.audit_log import MODULE_USERS
from app.schemas.admin_user import (
    ActionEmailResult,
    UserArchivedUpdate,
    UserCreate,
    UserEnabledUpdate,
    UserRead,
    UserUpdate,
)
from app.services.notifications import notify_user_created
from app.services.audit import Audit, audit_context, summarize_changes

router = APIRouter(prefix="/api/super-admin", tags=["super-admin-users"])

# Priority order: when a user holds several business roles, the first match wins.
# "super_admin" is the only one granting back-office access (app.core.auth
# .require_super_admin); "admin" is a plain business role like the others.
BUSINESS_ROLES = ("super_admin", "admin", "validateur", "consultant", "repondant")


SUPER_ADMIN_ROLE = "super_admin"
ADMIN_ROLE = "admin"

# Keycloak user attribute holding the `sub` of whoever created the account.
# Provenance only (shown in the audit trail) -- an "admin"'s visibility and
# management rights are scoped by shared `bank_id` (see _scope_to_bank /
# _assert_may_target below), not by who happened to create the account: two
# admins at the same bank manage the same pool of users. Relies on the
# realm's unmanagedAttributePolicy=ENABLED (app.keycloak_bootstrap), same as
# `organization` / `archived` / `bank_id`.
CREATED_BY_ATTR = "created_by"


# Field -> French label, for the "avant → après" text on a user edit.
USER_FIELD_LABELS = {
    "first_name": "Prénom",
    "last_name": "Nom",
    "email": "Email",
    "role": "Rôle",
    "status": "Statut",
    "organization": "Organisation",
    "bank_id": "Banque",
}


def _audit_snapshot(user: dict[str, Any], role: Optional[str]) -> dict[str, Any]:
    """The subset of a Keycloak user representation the audit trail reports on."""
    return {
        "first_name": user.get("firstName"),
        "last_name": user.get("lastName"),
        "email": user.get("email"),
        "role": role,
        "status": _status(user),
        "organization": _organization(user),
        "bank_id": _bank_id(user),
    }


def _scope_to_bank(params: dict[str, Any], bank_scope: Optional[int]) -> None:
    """Restrict a Keycloak ``/users`` query to accounts at the caller's bank.

    No-op when ``bank_scope`` is ``None`` (a super admin, via
    ``get_bank_scope`` -- full visibility). For an ``admin``, adds
    Keycloak's custom-attribute filter ``q=bank_id:<id>``, so the filtering
    happens in Keycloak and ``first``/``max`` keep paginating over the
    restricted set instead of over everyone. Role-based exclusions (never
    surface another admin or a super admin) still need a Python-side
    post-filter afterwards -- Keycloak's attribute search can't express
    "does NOT hold this realm role".
    """
    if bank_scope is None:
        return
    params["q"] = f"bank_id:{bank_scope}"


def _forbidden_super_admin() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=(
            "Seul un super administrateur peut gerer les comptes "
            "super administrateur."
        ),
    )


def _assert_may_assign(claims: dict[str, Any], role: str | None) -> None:
    """An ``admin`` may never grant ``super_admin`` -- that would let them
    promote themselves and make the two roles equivalent. Enforced here,
    server-side, not only by omitting the option from the UI dropdown."""
    if role == SUPER_ADMIN_ROLE and not is_super_admin(claims):
        raise _forbidden_super_admin()


async def _assert_may_target(
    claims: dict[str, Any], user_id: str, bank_scope: Optional[int]
) -> None:
    """Restrict what an ``admin`` may act on (edit, disable, archive, reset).

    Three rules, all irrelevant to a super admin (unrestricted):
    1. never an existing super-admin account;
    2. never another admin account either -- two admins at the same bank
       manage the shared pool of business-role users, not each other;
    3. only accounts at the caller's own bank (``bank_scope``, from
       ``get_bank_scope`` -- never ``None`` here, since a non-super-admin
       caller without a bank already got a 403 from that dependency).

    An account with no ``bank_id`` at all (predating the attribute, or
    edited to remove it) fails rule 3 automatically -- deliberately
    fail-closed rather than granting every admin access to it.
    """
    if is_super_admin(claims):
        return

    user, mappings = await asyncio.gather(
        kc_get(f"/users/{user_id}"),
        kc_get(f"/users/{user_id}/role-mappings/realm"),
    )
    target_roles = {m["name"] for m in mappings}
    if SUPER_ADMIN_ROLE in target_roles:
        raise _forbidden_super_admin()
    if ADMIN_ROLE in target_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Un administrateur ne peut pas gerer un autre compte administrateur.",
        )
    if _bank_id(user) != bank_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez gerer que les comptes rattaches a votre banque.",
        )


def _archived(user: dict[str, Any]) -> bool:
    values = (user.get("attributes") or {}).get("archived")
    return isinstance(values, list) and bool(values) and values[0] == "true"


def _status(user: dict[str, Any]) -> str:
    # Archived wins over everything: an archived account is also disabled, but
    # must not show up as merely "Désactivé".
    if _archived(user):
        return "Archivé"
    if not user.get("enabled", True):
        return "Désactivé"
    if not user.get("emailVerified", False):
        return "En attente"
    return "Actif"


def _status_to_flags(status: str) -> dict[str, bool]:
    # "Archivé" only blocks login; emailVerified is left untouched so the
    # pre-archive status resurfaces if the account is ever restored.
    if status == "Archivé":
        return {"enabled": False}
    if status == "Désactivé":
        return {"enabled": False, "emailVerified": True}
    if status == "En attente":
        return {"enabled": True, "emailVerified": False}
    return {"enabled": True, "emailVerified": True}


def _organization(user: dict[str, Any]) -> Optional[str]:
    values = (user.get("attributes") or {}).get("organization")
    if isinstance(values, list) and values:
        return values[0]
    return None


def _bank_id(user: dict[str, Any]) -> Optional[int]:
    values = (user.get("attributes") or {}).get("bank_id")
    raw = values[0] if isinstance(values, list) and values else None
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _assert_bank_required(role: Optional[str], bank_id: Optional[int]) -> None:
    """Every account except a super admin must be attached to a bank.

    ``get_bank_scope`` returns None (unrestricted) for a super admin, so a bank
    on one would be inert data. For everyone else it is the opposite: without
    ``bank_id`` that dependency raises 403, which locks the account out of the
    questionnaire, its results, the recommendations and both PDF reports. An
    account created without a bank is therefore an account that cannot use the
    product -- better refused here than discovered at first login.
    """
    if role == SUPER_ADMIN_ROLE or bank_id is not None:
        return
    raise HTTPException(
        status_code=400,
        detail=(
            "Une banque doit être associée au compte : sans elle, l'utilisateur "
            "n'aura accès ni au questionnaire ni à ses résultats."
        ),
    )


async def _validate_bank_id(db: AsyncSession, bank_id: Optional[int]) -> None:
    """Admin-set only (app.core.auth.get_bank_scope enforces it as a real
    permission boundary), so a typo here would silently grant a user
    access to the wrong bank's data -- worth a clear 400 instead."""
    if bank_id is None:
        return
    if await db.get(Bank, bank_id) is None:
        raise HTTPException(status_code=400, detail="Banque inconnue.")


def _created_at(user: dict[str, Any]) -> Optional[datetime]:
    ts = user.get("createdTimestamp")
    if ts is None:
        return None
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)


def _map_user(
    user: dict[str, Any],
    role: Optional[str] = None,
    last_login: Optional[datetime] = None,
) -> UserRead:
    return UserRead(
        id=user["id"],
        username=user.get("username"),
        first_name=user.get("firstName"),
        last_name=user.get("lastName"),
        email=user.get("email"),
        enabled=user.get("enabled", True),
        status=_status(user),
        organization=_organization(user),
        bank_id=_bank_id(user),
        role=role,
        created_at=_created_at(user),
        last_login=last_login,
    )


async def _last_login_by_user() -> dict[str, datetime]:
    """user_id -> most recent LOGIN event time, in one events query.

    Requires ``eventsEnabled`` on the realm (set by ``app.keycloak_bootstrap``)
    and the ``view-events`` role on the service account. Degrades to an empty
    map (column shows "-") instead of breaking the list when either is missing.
    Events come newest-first, so the first occurrence per user wins.
    """
    try:
        events = await kc_get("/events", {"type": "LOGIN", "max": 1000})
    except HTTPException:
        return {}
    latest: dict[str, datetime] = {}
    for ev in events:
        user_id = ev.get("userId")
        ts = ev.get("time")
        if user_id and ts and user_id not in latest:
            latest[user_id] = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    return latest


async def _role_by_user() -> dict[str, str]:
    """user_id -> highest-priority business role, via one members call per role."""
    member_lists = await asyncio.gather(
        *(kc_get(f"/roles/{name}/users", {"max": 1000}) for name in BUSINESS_ROLES)
    )
    mapping: dict[str, str] = {}
    # Iterate lowest priority first so higher-priority roles overwrite.
    for name, members in reversed(list(zip(BUSINESS_ROLES, member_lists))):
        for member in members:
            mapping[member["id"]] = name
    return mapping


async def _user_role(user_id: str) -> Optional[str]:
    mappings = await kc_get(f"/users/{user_id}/role-mappings/realm")
    held = {m["name"] for m in mappings}
    for name in BUSINESS_ROLES:
        if name in held:
            return name
    return None


async def _set_business_role(user_id: str, role: str) -> None:
    """Make ``role`` the user's only business role (idempotent)."""
    all_roles = await kc_get("/roles")
    by_name = {r["name"]: r for r in all_roles if r["name"] in BUSINESS_ROLES}
    if role not in by_name:
        raise HTTPException(
            status_code=500,
            detail=f"Realm role '{role}' is missing in Keycloak.",
        )

    mappings = await kc_get(f"/users/{user_id}/role-mappings/realm")
    held = {m["name"] for m in mappings if m["name"] in BUSINESS_ROLES}

    to_remove = [by_name[n] for n in held - {role}]
    if to_remove:
        await kc_delete(f"/users/{user_id}/role-mappings/realm", json=to_remove)
    if role not in held:
        await kc_post(f"/users/{user_id}/role-mappings/realm", [by_name[role]])


APP_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def _generate_temp_password(length: int = 12) -> str:
    """Random password guaranteed to contain lower/upper/digit characters."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
        ):
            return pwd


async def _set_temp_password(user_id: str) -> str:
    pwd = _generate_temp_password()
    await kc_put(
        f"/users/{user_id}/reset-password",
        {"type": "password", "value": pwd, "temporary": True},
    )
    return pwd


async def _email_credentials(
    to: str, first_name: str, password: str, *, created: bool
) -> None:
    if created:
        subject = "Création de votre compte DataPilot"
        body = (
            f"Bonjour {first_name},\n\n"
            "Dans le cadre de votre accès à la plateforme DataPilot, nous vous informons "
            "que votre compte a été créé avec succès.\n\n"
            "Vos identifiants de connexion sont les suivants :\n\n"
            f"Identifiant : {to}\n"
            f"Mot de passe temporaire : {password}\n\n"
            "Vous pouvez accéder à la plateforme à l'adresse suivante :\n"
            f"{APP_URL}\n\n"
            "Lors de votre première connexion, vous serez invité(e) à définir un nouveau "
            "mot de passe afin de sécuriser votre compte.\n\n"
            "Nous vous recommandons de ne pas communiquer vos identifiants de connexion "
            "à un tiers.\n\n"
            "En cas de difficulté d'accès, veuillez contacter l'administrateur de la "
            "plateforme.\n\n"
            "Cordialement,\n\n"
            "Cet email a été généré automatiquement. Merci de ne pas y répondre."
        )
    else:
        subject = "Réinitialisation de votre mot de passe DataPilot"
        body = (
            f"Bonjour {first_name},\n\n"
            "Votre mot de passe DataPilot vient d'être réinitialisé.\n\n"
            f"    Identifiant : {to}\n"
            f"    Mot de passe temporaire : {password}\n\n"
            f"Connectez-vous sur {APP_URL}, vous devrez choisir un nouveau mot de passe "
            "lors de votre première connexion.\n\n"
            "Ce message a été généré automatiquement, merci de ne pas y répondre."
        )
    await send_email(to, subject, body)


@router.get("/users", response_model=list[UserRead])
async def list_users(
    search: Optional[str] = Query(None, description="Match name / email / username"),
    first: int = Query(0, ge=0, description="Pagination offset"),
    max: int = Query(20, ge=1, le=100, description="Page size"),
    claims: dict = Depends(require_back_office),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    params: dict[str, Any] = {"first": first, "max": max}
    if search:
        params["search"] = search
    # Scope an "admin" to their bank's accounts. Filtering server-side
    # (Keycloak's `q=key:value` attribute search) rather than in Python keeps
    # pagination honest -- a post-filter would return short pages.
    _scope_to_bank(params, bank_scope)

    users, roles, logins = await asyncio.gather(
        kc_get("/users", params), _role_by_user(), _last_login_by_user()
    )
    # Defence in depth: never surface an account _assert_may_target would
    # refuse to act on -- another admin, or any super admin.
    if not is_super_admin(claims):
        users = [u for u in users if roles.get(u["id"]) not in (SUPER_ADMIN_ROLE, ADMIN_ROLE)]
    return [_map_user(u, roles.get(u["id"]), logins.get(u["id"])) for u in users]


@router.get("/users/count")
async def count_users(
    search: Optional[str] = Query(None),
    claims: dict = Depends(require_back_office),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    params: dict[str, Any] = {}
    if search:
        params["search"] = search
    # Same scoping as list_users -- otherwise an admin sees "3 of 47" while
    # only 3 rows exist for them.
    _scope_to_bank(params, bank_scope)
    return {"count": await kc_get("/users/count", params)}


@router.post("/users", response_model=UserRead, status_code=201)
async def create_user(
    payload: UserCreate,
    background_tasks: BackgroundTasks,
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
):
    _assert_may_assign(claims, payload.role)
    _assert_bank_required(payload.role, payload.bank_id)
    await _validate_bank_id(db, payload.bank_id)

    attributes: dict[str, Any] = {}
    if payload.organization:
        attributes["organization"] = [payload.organization]
    if payload.bank_id is not None:
        attributes["bank_id"] = [str(payload.bank_id)]
    if payload.status == "Archivé":
        attributes["archived"] = ["true"]
    # Ownership marker: an "admin" only ever sees and manages the accounts
    # they created themselves. Recorded for super admins too, so the
    # provenance of every account stays traceable.
    creator_sub = claims.get("sub")
    if creator_sub:
        attributes[CREATED_BY_ATTR] = [creator_sub]

    representation: dict[str, Any] = {
        # A stable, opaque username decoupled from email, the realm has
        # loginWithEmailAllowed, so this doesn't affect login. Deriving it from
        # email instead created a footgun: usernames can't be edited afterward
        # (editUsernameAllowed is off), so a changed email left a stale
        # username behind that permanently blocked that address from ever
        # being reused by another account.
        "username": f"user-{secrets.token_hex(8)}",
        "email": payload.email,
        "firstName": payload.first_name,
        "lastName": payload.last_name,
        **_status_to_flags(payload.status),
    }
    if attributes:
        representation["attributes"] = attributes

    resp = await kc_post("/users", representation)
    # Keycloak returns the new user's location: .../users/{id}
    location = resp.headers.get("Location", "")
    user_id = location.rstrip("/").rsplit("/", 1)[-1]
    if not user_id:
        raise HTTPException(status_code=502, detail="Keycloak did not return the new user id.")

    # Role/password setup isn't transactional with the user-creation call above.
    # If either step fails (e.g. a transient Keycloak hiccup), the account would
    # otherwise be left half-configured, invisible to the admin but blocking a
    # retry with a duplicate-email 409. Roll it back so failure here is all-or-nothing.
    try:
        await _set_business_role(user_id, payload.role)
        temp_password = await _set_temp_password(user_id)
    except HTTPException as exc:
        try:
            await kc_delete(f"/users/{user_id}")
        except HTTPException:
            pass  # best-effort cleanup; the account may need manual removal
        raise HTTPException(
            status_code=exc.status_code,
            detail=f"{exc.detail} (utilisateur annulé, vous pouvez réessayer).",
        )

    # No credentials email for an account born archived: it can't log in, and a
    # reset can be sent after restoration. Otherwise, the account exists even if
    # the email fails, tell the admin how to recover instead of failing as if
    # nothing was created.
    if payload.status != "Archivé":
        try:
            await _email_credentials(
                payload.email, payload.first_name, temp_password, created=True
            )
        except HTTPException:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Utilisateur créé, mais l'envoi de l'email a échoué. "
                    "Utilisez « Réinitialiser le mot de passe » pour renvoyer un accès."
                ),
            )

    user = await kc_get(f"/users/{user_id}")
    await audit.record(
        module=MODULE_USERS,
        action="Création compte utilisateur",
        entity_type="user",
        entity_id=user_id,
        entity_label=payload.email,
        after=f"{payload.email} · {payload.role}",
        details={"statut": payload.status, "organisation": payload.organization},
    )
    # After the account exists: notifying is a courtesy, never a reason to fail.
    background_tasks.add_task(
        notify_user_created,
        email=payload.email,
        role=payload.role,
        author=audit.actor_name,
        actor_email=audit.actor_email,
    )
    return _map_user(user, payload.role)


@router.put("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    # Both directions: an admin may neither target an existing super admin
    # (or another admin) nor promote anyone (including themselves) to super_admin.
    await _assert_may_target(claims, user_id, bank_scope)
    _assert_may_assign(claims, payload.role)
    _assert_bank_required(payload.role, payload.bank_id)
    await _validate_bank_id(db, payload.bank_id)

    user = await kc_get(f"/users/{user_id}")
    previous = _audit_snapshot(user, await _user_role(user_id))
    # username is intentionally left untouched: the realm has editUsernameAllowed
    # disabled (admin API edits are rejected too), and login works by email
    # anyway (loginWithEmailAllowed), see create_user for why username is no
    # longer derived from email at all.
    user.update(
        {
            "firstName": payload.first_name,
            "lastName": payload.last_name,
            "email": payload.email,
            **_status_to_flags(payload.status),
        }
    )
    attributes = user.get("attributes") or {}
    if payload.organization:
        attributes["organization"] = [payload.organization]
    else:
        attributes.pop("organization", None)
    if payload.bank_id is not None:
        attributes["bank_id"] = [str(payload.bank_id)]
    else:
        attributes.pop("bank_id", None)
    # The modal's status is the complete state: picking "Archivé" archives,
    # picking anything else restores.
    if payload.status == "Archivé":
        attributes["archived"] = ["true"]
    else:
        attributes.pop("archived", None)
    user["attributes"] = attributes

    await kc_put(f"/users/{user_id}", user)
    await _set_business_role(user_id, payload.role)

    updated = await kc_get(f"/users/{user_id}")
    before, after, fields = summarize_changes(
        previous, _audit_snapshot(updated, payload.role), USER_FIELD_LABELS
    )
    if fields:
        await audit.record(
            module=MODULE_USERS,
            action=f"Modification compte {payload.email}",
            entity_type="user",
            entity_id=user_id,
            entity_label=payload.email,
            before=before,
            after=after,
            details={"champs": fields},
        )
    return _map_user(updated, payload.role)


@router.put("/users/{user_id}/enabled", response_model=UserRead)
async def set_user_enabled(
    user_id: str,
    payload: UserEnabledUpdate,
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    await _assert_may_target(claims, user_id, bank_scope)
    user = await kc_get(f"/users/{user_id}")
    was = _status(user)
    user["enabled"] = payload.enabled
    await kc_put(f"/users/{user_id}", user)

    updated, role = await asyncio.gather(
        kc_get(f"/users/{user_id}"), _user_role(user_id)
    )
    await audit.record(
        module=MODULE_USERS,
        action=("Activation" if payload.enabled else "Désactivation")
        + " compte utilisateur",
        entity_type="user",
        entity_id=user_id,
        entity_label=updated.get("email") or user_id,
        before=was,
        after=_status(updated),
    )
    return _map_user(updated, role)


@router.put("/users/{user_id}/archived", response_model=UserRead)
async def set_user_archived(
    user_id: str,
    payload: UserArchivedUpdate,
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    await _assert_may_target(claims, user_id, bank_scope)
    user = await kc_get(f"/users/{user_id}")
    was = _status(user)
    attributes = user.get("attributes") or {}
    if payload.archived:
        # Archiving both hides the account (attribute) and blocks login (enabled).
        attributes["archived"] = ["true"]
        user["enabled"] = False
    else:
        # Restoring brings the account fully back to life.
        attributes.pop("archived", None)
        user["enabled"] = True
    user["attributes"] = attributes
    await kc_put(f"/users/{user_id}", user)

    updated, role = await asyncio.gather(
        kc_get(f"/users/{user_id}"), _user_role(user_id)
    )
    await audit.record(
        module=MODULE_USERS,
        action=("Archivage" if payload.archived else "Restauration")
        + " compte utilisateur",
        entity_type="user",
        entity_id=user_id,
        entity_label=updated.get("email") or user_id,
        before=was,
        after=_status(updated),
    )
    return _map_user(updated, role)


@router.put("/users/{user_id}/reset-password", response_model=ActionEmailResult)
async def reset_user_password(
    user_id: str,
    claims: dict = Depends(require_back_office),
    db: AsyncSession = Depends(get_db),
    audit: Audit = Depends(audit_context),
    bank_scope: Optional[int] = Depends(get_bank_scope),
):
    await _assert_may_target(claims, user_id, bank_scope)
    # 404 passthrough if the user doesn't exist.
    user = await kc_get(f"/users/{user_id}")
    email = user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Cet utilisateur n'a pas d'adresse email.")

    temp_password = await _set_temp_password(user_id)
    await _email_credentials(
        email, user.get("firstName") or "", temp_password, created=False
    )
    # The password itself is never recorded, only that a reset was sent.
    await audit.record(
        module=MODULE_USERS,
        action="Réinitialisation du mot de passe",
        entity_type="user",
        entity_id=user_id,
        entity_label=email,
        after=f"Mot de passe temporaire envoyé à {email}",
    )
    return ActionEmailResult(email=email)
