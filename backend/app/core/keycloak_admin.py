from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import HTTPException, status

load_dotenv()

KEYCLOAK_URL = (os.getenv("KEYCLOAK_URL") or "").rstrip("/")
REALM = os.getenv("KEYCLOAK_REALM")
ADMIN_CLIENT_ID = os.getenv("KEYCLOAK_ADMIN_CLIENT_ID")
ADMIN_CLIENT_SECRET = os.getenv("KEYCLOAK_ADMIN_CLIENT_SECRET")

TOKEN_URL = f"{KEYCLOAK_URL}/realms/{REALM}/protocol/openid-connect/token"
ADMIN_BASE = f"{KEYCLOAK_URL}/admin/realms/{REALM}"

_EXPIRY_SKEW = 15
_TIMEOUT = 10.0

_token_cache: dict[str, Any] = {"access_token": None, "expires_at": 0.0}
_token_lock = asyncio.Lock()

# One client for the whole process, reused across calls.
#
# This is a performance fix, not a tidiness one. Constructing an
# ``httpx.AsyncClient`` builds an SSL context and loads the system certificate
# store, which on Windows costs ~300 ms, paid on *every* call when the client
# was created per request, regardless of how small the response was. Keycloak
# itself answers in single-digit milliseconds. Reusing one client also lets
# concurrent calls share the connection pool, so the five role lookups behind
# ``_role_by_user`` overlap instead of queueing behind five separate handshakes.
_client: httpx.AsyncClient | None = None
_client_loop: asyncio.AbstractEventLoop | None = None


def _http() -> httpx.AsyncClient:
    """The shared client, rebuilt if it was closed or belongs to a dead loop.

    A client is bound to the event loop that created it, so the loop check
    matters for anything that runs several loops in one process (tests, an
    interactive shell) -- reusing one across loops fails at the transport.
    """
    global _client, _client_loop
    loop = asyncio.get_running_loop()
    if _client is None or _client.is_closed or _client_loop is not loop:
        _client = httpx.AsyncClient(timeout=_TIMEOUT)
        _client_loop = loop
    return _client


async def close_client() -> None:
    """Release the shared client on shutdown."""
    global _client, _client_loop
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
    _client_loop = None


async def _fetch_token() -> dict[str, Any]:
    if not (ADMIN_CLIENT_ID and ADMIN_CLIENT_SECRET and REALM and KEYCLOAK_URL):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Keycloak admin client is not configured (missing env vars).",
        )
    try:
        resp = await _http().post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": ADMIN_CLIENT_ID,
                    "client_secret": ADMIN_CLIENT_SECRET,
                },
        )
    except httpx.RequestError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication server unavailable",
        )
    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not obtain Keycloak admin token (check backend client config).",
        )
    return resp.json()


async def get_admin_token(force_refresh: bool = False) -> str:
    now = time.monotonic()
    if (
        not force_refresh
        and _token_cache["access_token"]
        and now < _token_cache["expires_at"]
    ):
        return _token_cache["access_token"]

    async with _token_lock:
        now = time.monotonic()
        if (
            not force_refresh
            and _token_cache["access_token"]
            and now < _token_cache["expires_at"]
        ):
            return _token_cache["access_token"]

        data = await _fetch_token()
        _token_cache["access_token"] = data["access_token"]
        _token_cache["expires_at"] = (
            time.monotonic() + data.get("expires_in", 60) - _EXPIRY_SKEW
        )
        return _token_cache["access_token"]


def _raise_for_keycloak(resp: httpx.Response) -> None:
    if resp.is_success:
        return

    detail: str
    try:
        body = resp.json()
        detail = body.get("errorMessage") or body.get("error") or str(body)
    except ValueError:
        detail = resp.text or "Keycloak request failed"

    if resp.status_code in (400, 403, 404, 409):
        raise HTTPException(status_code=resp.status_code, detail=detail)
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Keycloak error ({resp.status_code}): {detail}",
    )


async def kc_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: Any | None = None,
) -> httpx.Response:
    url = f"{ADMIN_BASE}{path}"

    async def _send(token: str) -> httpx.Response:
        try:
            return await _http().request(
                method,
                url,
                params=params,
                json=json,
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Keycloak server unavailable",
            )

    resp = await _send(await get_admin_token())
    if resp.status_code == 401:
        resp = await _send(await get_admin_token(force_refresh=True))

    _raise_for_keycloak(resp)
    return resp


async def kc_get(path: str, params: dict[str, Any] | None = None) -> Any:
    resp = await kc_request("GET", path, params=params)
    return resp.json()


async def kc_post(path: str, json: Any | None = None) -> httpx.Response:
    return await kc_request("POST", path, json=json)


async def kc_put(path: str, json: Any | None = None) -> None:
    await kc_request("PUT", path, json=json)


async def kc_delete(path: str, json: Any | None = None) -> None:
    await kc_request("DELETE", path, json=json)
