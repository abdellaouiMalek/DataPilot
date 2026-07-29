"""Keycloak access-token verification and role-based dependencies.

Tokens are verified against the realm's JWKS (signature + issuer + expiry).
We don't enforce a specific ``aud`` for the public SPA client; instead we
optionally check ``azp`` (authorized party) against the expected client id.
"""

import os

import requests
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

load_dotenv()

KEYCLOAK_URL = os.getenv("KEYCLOAK_URL")
REALM = os.getenv("KEYCLOAK_REALM")
ALGORITHMS = [a.strip() for a in os.getenv("KEYCLOAK_ALGORITHMS", "RS256").split(",")]
# Optional: if set, the token's `azp` must match (the SPA client id).
CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID")
ADMIN_ROLE = os.getenv("KEYCLOAK_ADMIN_ROLE", "admin")

ISSUER = f"{KEYCLOAK_URL}/realms/{REALM}"
CERTS_URL = f"{ISSUER}/protocol/openid-connect/certs"

security = HTTPBearer()

# Cached JWKS ({"keys": [...]}). Refreshed on first use and on key rotation.
_jwks_cache: dict = {}


def _get_jwks(force_refresh: bool = False) -> dict:
    if force_refresh or not _jwks_cache:
        resp = requests.get(CERTS_URL, timeout=10)
        resp.raise_for_status()
        _jwks_cache.clear()
        _jwks_cache.update(resp.json())
    return _jwks_cache


def _has_kid(jwks: dict, kid: str | None) -> bool:
    return any(k.get("kid") == kid for k in jwks.get("keys", []))


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate the bearer token and return its decoded claims."""
    token = credentials.credentials

    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        jwks = _get_jwks()
        if not _has_kid(jwks, kid):
            jwks = _get_jwks(force_refresh=True)  # handle key rotation
    except requests.RequestException:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication server unavailable",
        )

    try:
        payload = jwt.decode(
            token,
            jwks,  # python-jose selects the matching key by `kid`
            algorithms=ALGORITHMS,
            issuer=ISSUER,
            options={"verify_aud": False},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if CLIENT_ID and payload.get("azp") != CLIENT_ID:
        raise HTTPException(status_code=401, detail="Invalid token (unexpected client)")

    return payload


def require_admin(payload: dict = Depends(verify_token)) -> dict:
    """Allow only callers holding the realm ``admin`` role."""
    roles = payload.get("realm_access", {}).get("roles", [])
    if ADMIN_ROLE not in roles:
        raise HTTPException(status_code=403, detail="Admin role required")
    return payload


async def get_bank_scope(claims: dict = Depends(verify_token)) -> int | None:
    """Resolves the caller's bank-access scope for assessment data.

    Returns ``None`` for admins: unrestricted, matching the full access
    they already have via the ``/admin`` back-office. For everyone else,
    returns the bank id attached to their account (an admin-managed
    Keycloak user attribute, ``bank_id`` -- see app.routers.admin_users;
    intentionally not user-editable, since it's a real permission
    boundary, not a profile preference).

    Fetched live from the Keycloak Admin API on every call rather than
    read from the token's own claims: no protocol mapper exposes it there
    today, and this matches the pattern app.routers.profile already uses
    for other custom attributes. If this ever needs to avoid the extra
    round-trip, add a mapper that puts ``bank_id`` in the access token
    and read it from ``claims`` directly instead.

    Raises 403 if a non-admin has no bank attached -- a real
    configuration gap, not a "nothing to show yet" case, so it's an
    explicit error rather than a silently empty result.
    """
    # Imported lazily to avoid a module-load-order dependency between the
    # two app.core modules (auth.py is imported very early, by almost
    # every router).
    from app.core.keycloak_admin import kc_get

    roles = claims.get("realm_access", {}).get("roles", [])
    if ADMIN_ROLE in roles:
        return None

    sub = claims.get("sub")
    user = await kc_get(f"/users/{sub}")
    values = (user.get("attributes") or {}).get("bank_id")
    raw = values[0] if isinstance(values, list) and values else None
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Aucune banque n'est associee a ce compte. "
                "Contactez un administrateur."
            ),
        )
    try:
        return int(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Attribut bank_id invalide pour cet utilisateur.",
        )
