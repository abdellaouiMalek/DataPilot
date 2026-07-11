"""Admin user-management endpoints, proxying the Keycloak Admin REST API.

Identity lives entirely in Keycloak (no local users table). Business roles are
Keycloak realm roles; the UI's French labels map 1:1 to them. Passwords are
never seen by the admin: creation and reset generate a random temporary
password (``temporary: true`` forces a change at first login) that the backend
emails directly to the user — Keycloak itself cannot email passwords, so the
mail goes out via ``app.core.mailer``.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import string
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import require_admin
from app.core.keycloak_admin import kc_delete, kc_get, kc_post, kc_put
from app.core.mailer import send_email
from app.schemas.admin_user import (
    ActionEmailResult,
    UserArchivedUpdate,
    UserCreate,
    UserEnabledUpdate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin-users"])

# Priority order: when a user holds several business roles, the first match wins.
BUSINESS_ROLES = ("admin", "validateur", "consultant", "repondant")


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


def _created_at(user: dict[str, Any]) -> Optional[datetime]:
    ts = user.get("createdTimestamp")
    if ts is None:
        return None
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)


def _map_user(user: dict[str, Any], role: Optional[str] = None) -> UserRead:
    return UserRead(
        id=user["id"],
        username=user.get("username"),
        first_name=user.get("firstName"),
        last_name=user.get("lastName"),
        email=user.get("email"),
        enabled=user.get("enabled", True),
        status=_status(user),
        organization=_organization(user),
        role=role,
        created_at=_created_at(user),
    )


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
    subject = (
        "Votre accès DataPilot" if created else "Réinitialisation de votre mot de passe DataPilot"
    )
    intro = (
        "Votre compte DataPilot vient d'être créé."
        if created
        else "Votre mot de passe DataPilot vient d'être réinitialisé."
    )
    body = (
        f"Bonjour {first_name},\n\n"
        f"{intro}\n\n"
        f"    Identifiant : {to}\n"
        f"    Mot de passe temporaire : {password}\n\n"
        f"Connectez-vous sur {APP_URL} — vous devrez choisir un nouveau mot de passe "
        f"lors de votre première connexion.\n\n"
        f"Ce message a été généré automatiquement, merci de ne pas y répondre."
    )
    await send_email(to, subject, body)


@router.get("/users", response_model=list[UserRead])
async def list_users(
    search: Optional[str] = Query(None, description="Match name / email / username"),
    first: int = Query(0, ge=0, description="Pagination offset"),
    max: int = Query(20, ge=1, le=100, description="Page size"),
    _claims: dict = Depends(require_admin),
):
    params: dict[str, Any] = {"first": first, "max": max}
    if search:
        params["search"] = search
    users, roles = await asyncio.gather(kc_get("/users", params), _role_by_user())
    return [_map_user(u, roles.get(u["id"])) for u in users]


@router.get("/users/count")
async def count_users(
    search: Optional[str] = Query(None),
    _claims: dict = Depends(require_admin),
):
    params: dict[str, Any] = {}
    if search:
        params["search"] = search
    return {"count": await kc_get("/users/count", params)}


@router.post("/users", response_model=UserRead, status_code=201)
async def create_user(
    payload: UserCreate,
    _claims: dict = Depends(require_admin),
):
    attributes: dict[str, Any] = {}
    if payload.organization:
        attributes["organization"] = [payload.organization]
    if payload.status == "Archivé":
        attributes["archived"] = ["true"]

    representation: dict[str, Any] = {
        "username": payload.email,
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

    await _set_business_role(user_id, payload.role)
    temp_password = await _set_temp_password(user_id)

    # No credentials email for an account born archived: it can't log in, and a
    # reset can be sent after restoration. Otherwise, the account exists even if
    # the email fails — tell the admin how to recover instead of failing as if
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
    return _map_user(user, payload.role)


@router.put("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    _claims: dict = Depends(require_admin),
):
    user = await kc_get(f"/users/{user_id}")
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
    return _map_user(updated, payload.role)


@router.put("/users/{user_id}/enabled", response_model=UserRead)
async def set_user_enabled(
    user_id: str,
    payload: UserEnabledUpdate,
    _claims: dict = Depends(require_admin),
):
    user = await kc_get(f"/users/{user_id}")
    user["enabled"] = payload.enabled
    await kc_put(f"/users/{user_id}", user)

    updated, role = await asyncio.gather(
        kc_get(f"/users/{user_id}"), _user_role(user_id)
    )
    return _map_user(updated, role)


@router.put("/users/{user_id}/archived", response_model=UserRead)
async def set_user_archived(
    user_id: str,
    payload: UserArchivedUpdate,
    _claims: dict = Depends(require_admin),
):
    user = await kc_get(f"/users/{user_id}")
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
    return _map_user(updated, role)


@router.put("/users/{user_id}/reset-password", response_model=ActionEmailResult)
async def reset_user_password(
    user_id: str,
    _claims: dict = Depends(require_admin),
):
    # 404 passthrough if the user doesn't exist.
    user = await kc_get(f"/users/{user_id}")
    email = user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Cet utilisateur n'a pas d'adresse email.")

    temp_password = await _set_temp_password(user_id)
    await _email_credentials(
        email, user.get("firstName") or "", temp_password, created=False
    )
    return ActionEmailResult(email=email)
