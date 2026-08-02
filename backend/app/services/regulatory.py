"""Import pipeline for "Veille réglementaire": turns an uploaded PDF or a
URL into extracted text, runs it through the LLM extractor
(``llm.generation.extract_circular``), and returns plain data the router
persists as a ``RegulatoryCircular`` + its ``RegulatoryImpact`` rows.

Kept as pure functions with no DB access -- the router owns persistence,
this module only owns "turn raw input into a proposed circular".
"""

from __future__ import annotations

import asyncio
import io
import ipaddress
import socket
from datetime import date, datetime
from typing import Any

import httpx
from fastapi import HTTPException, status
from pypdf import PdfReader

from llm.generation import extract_circular

MAX_SOURCE_BYTES = 20 * 1024 * 1024  # 20 MB
FETCH_TIMEOUT_SECONDS = 20.0


def _extract_pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""


def _looks_internal_host(hostname: str) -> bool:
    """Best-effort SSRF guard: this endpoint lets an authenticated admin
    trigger a server-side fetch of an arbitrary URL, so it's worth refusing
    the obvious cases (loopback/private/link-local) even though the caller
    is trusted -- cheap to check, meaningfully reduces blast radius."""
    if not hostname or hostname.lower() == "localhost":
        return True
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
    except Exception:
        return False  # can't resolve here -- let the real fetch fail naturally


async def fetch_source(*, file_bytes: bytes | None, filename: str | None, url: str | None) -> tuple[bytes, str]:
    """Returns (raw_bytes, filename) from either an uploaded file or a URL."""
    if file_bytes is not None:
        if len(file_bytes) > MAX_SOURCE_BYTES:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Fichier trop volumineux (max 20 Mo)."
            )
        return file_bytes, filename or "document.pdf"

    assert url is not None
    parsed = httpx.URL(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Seuls les liens http(s) sont acceptés."
        )
    if _looks_internal_host(parsed.host or ""):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cette adresse n'est pas accessible."
        )

    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Impossible de récupérer le document : {exc}",
        )

    if len(resp.content) > MAX_SOURCE_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Fichier trop volumineux (max 20 Mo)."
        )

    source_filename = (parsed.path.rsplit("/", 1)[-1] or "document").strip()
    return resp.content, source_filename


def _looks_like_pdf(data: bytes) -> bool:
    return data[:5] == b"%PDF-"


async def analyze_source(
    file_bytes: bytes | None, filename: str | None, url: str | None
) -> dict[str, Any]:
    """Fetches (if needed), extracts text from, and LLM-analyzes a
    circular. Returns a dict ready to persist:
    ``{reference, theme, publication_date, raw_text, source_filename,
    source_url, impacts}``.
    """
    raw_bytes, source_filename = await fetch_source(
        file_bytes=file_bytes, filename=filename, url=url
    )

    text = _extract_pdf_text(raw_bytes) if _looks_like_pdf(raw_bytes) else (
        raw_bytes.decode("utf-8", errors="ignore")
    )
    if not text.strip():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Aucun texte n'a pu être extrait de ce document.",
        )

    # extract_circular is a synchronous, CPU/network-bound LLM call (up to
    # a couple of minutes on local CPU inference) -- run it off the event
    # loop so it doesn't stall every other request in the meantime.
    extracted = await asyncio.to_thread(extract_circular, text, source_filename)

    publication_date: date | None = None
    if extracted.get("publication_date"):
        try:
            publication_date = datetime.strptime(
                extracted["publication_date"], "%Y-%m-%d"
            ).date()
        except ValueError:
            publication_date = None

    return {
        "reference": extracted["reference"],
        "theme": extracted["theme"],
        "publication_date": publication_date,
        "raw_text": text[:50_000],  # cap what we store, not what we analyze
        "source_filename": filename or (source_filename if not url else None),
        "source_url": url,
        "impacts": extracted["impacts"],
    }
