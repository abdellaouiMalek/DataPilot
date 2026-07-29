"""Self-service profile endpoints for the authenticated Keycloak user."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_token
from app.core.keycloak_admin import kc_get, kc_put
from app.db.database import get_db
from app.models import Bank
from app.schemas.profile import ProfileRead, ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])
BUSINESS_ROLES = ("admin", "consultant", "repondant", "validateur")


def _first_attribute(user: dict[str, Any], name: str) -> str | None:
    values = (user.get("attributes") or {}).get(name)
    if isinstance(values, list) and values:
        return values[0]
    if isinstance(values, str):
        return values
    return None


def _bank_id(user: dict[str, Any]) -> int | None:
    raw = _first_attribute(user, "bank_id")
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _role(claims: dict[str, Any]) -> str | None:
    roles = claims.get("realm_access", {}).get("roles", [])
    return next((role for role in BUSINESS_ROLES if role in roles), None)


def _map_profile(
    user: dict[str, Any],
    claims: dict[str, Any],
    bank_name: str | None = None,
) -> ProfileRead:
    return ProfileRead(
        id=user["id"],
        first_name=user.get("firstName"),
        last_name=user.get("lastName"),
        email=user.get("email"),
        organization=_first_attribute(user, "organization"),
        role=_role(claims),
        bank_id=_bank_id(user),
        bank_name=bank_name,
    )


async def _resolve_bank_name(
    db: AsyncSession, user: dict[str, Any]
) -> str | None:
    bank_id = _bank_id(user)
    if bank_id is None:
        return None
    bank = await db.get(Bank, bank_id)
    return bank.name if bank is not None else None


async def _current_user(claims: dict[str, Any]) -> dict[str, Any]:
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Jeton utilisateur invalide.")
    return await kc_get(f"/users/{user_id}")


@router.get("", response_model=ProfileRead)
async def get_profile(
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> ProfileRead:
    user = await _current_user(claims)
    bank_name = await _resolve_bank_name(db, user)
    return _map_profile(user, claims, bank_name)


@router.put("", response_model=ProfileRead)
async def update_profile(
    payload: ProfileUpdate,
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> ProfileRead:
    user = await _current_user(claims)
    user["firstName"] = payload.first_name.strip()
    user["lastName"] = payload.last_name.strip()
    user["email"] = str(payload.email).lower()

    attributes = user.get("attributes") or {}
    organization = (payload.organization or "").strip()
    if organization:
        attributes["organization"] = [organization]
    else:
        attributes.pop("organization", None)
    # bank_id is intentionally untouched here -- it's not in ProfileUpdate,
    # so whatever an admin set stays as-is regardless of what else changes.
    user["attributes"] = attributes

    await kc_put(f"/users/{user['id']}", user)
    updated = await kc_get(f"/users/{user['id']}")
    bank_name = await _resolve_bank_name(db, updated)
    return _map_profile(updated, claims, bank_name)
