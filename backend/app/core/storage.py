"""Local file storage for user-uploaded assets served straight off disk.

Currently just bank logos: small, public, non-sensitive images (the landing
page shows them to anyone), so plain files under a static-served directory
are enough, no object storage needed. If another upload type shows up later,
split this into per-asset-type modules instead of overloading this one.
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

LOGOS_DIR = Path(__file__).resolve().parent.parent / "static" / "logos"
LOGOS_DIR.mkdir(parents=True, exist_ok=True)

LOGO_URL_PREFIX = "/static/logos"

# Raster only: an uploaded SVG would be served back and dropped straight into
# an <img src>, which browsers don't execute as script -- but keeping the
# allowlist to formats with no active content removes the question entirely.
_ALLOWED_LOGO_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2 MB


async def save_bank_logo(
    bank_id: int, file: UploadFile, *, previous_path: Optional[str]
) -> str:
    """Validate and write the upload under a bank-id-based filename, return
    the new ``logo_path`` to store on the row. Replaces any previous file for
    this bank, including one that had a different extension.
    """
    ext = _ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=415,
            detail="Format non supporté (PNG, JPG ou WebP uniquement).",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide.")
    if len(data) > MAX_LOGO_SIZE:
        raise HTTPException(status_code=413, detail="Le fichier dépasse 2 Mo.")

    _delete_logo_file(previous_path)
    filename = f"{bank_id}.{ext}"
    (LOGOS_DIR / filename).write_bytes(data)
    return filename


def delete_bank_logo(logo_path: Optional[str]) -> None:
    _delete_logo_file(logo_path)


def _delete_logo_file(logo_path: Optional[str]) -> None:
    if not logo_path:
        return
    path = LOGOS_DIR / logo_path
    if path.exists():
        path.unlink()


def logo_url(logo_path: Optional[str]) -> Optional[str]:
    """Public URL for a stored logo, relative to the API's own origin."""
    return f"{LOGO_URL_PREFIX}/{logo_path}" if logo_path else None


def logo_data_uri(logo_path: Optional[str]) -> Optional[str]:
    """Base64 data: URI for embedding a logo straight into a WeasyPrint PDF,
    where it shouldn't depend on the template's ``base_url`` resolution.
    """
    if not logo_path:
        return None
    path = LOGOS_DIR / logo_path
    if not path.exists():
        return None
    mime, _ = mimetypes.guess_type(logo_path)
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime or 'application/octet-stream'};base64,{encoded}"
