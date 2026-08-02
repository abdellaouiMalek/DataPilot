"""Jinja2 + WeasyPrint report rendering.

Two report types, both rendered from HTML/CSS templates in
``app/templates/pdf/``:

- ``evaluation_report.html``  -- a single assessment's results.
- ``comparison_report.html``  -- two assessments (an evolution) compared.

WeasyPrint does the actual HTML -> PDF rendering; on Windows it needs the
native Pango/cairo/GObject libraries, which pip doesn't ship (see
``_bootstrap_windows_dlls`` below). On Linux (prod/Docker) the equivalent
system packages -- e.g. ``libpango-1.0-0 libpangoft2-1.0-0 libcairo2`` --
are expected to already be installed, and this bootstrap is a no-op there.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "pdf"


def _bootstrap_windows_dlls() -> None:
    """Make WeasyPrint's native libraries loadable on Windows.

    WeasyPrint has no bundled binaries for Windows; it dlopen()s Pango/
    cairo/GObject at import time and expects them to already be on the
    system (normally via the GTK3 runtime installer, which requires admin
    rights to install). ``GTK_DLL_DIR`` points at a conda environment
    holding just those libraries (``conda create -n gtk-libs -c conda-forge
    pango cairo gdk-pixbuf fontconfig glib``) as an admin-free alternative
    -- see SETUP.local.md for how to reproduce it on a fresh machine.

    Some unrelated tools (observed: Tesseract-OCR) ship their own,
    incompatible copy of libgobject/libglib and put it on PATH; even with
    the conda directory registered via ``os.add_dll_directory``, Windows'
    DLL search still finds those first and fails to load them. Dropping
    such directories from PATH for this process is what actually fixes it.
    """
    if os.name != "nt":
        return

    gtk_dir = os.getenv(
        "GTK_DLL_DIR", r"C:\Users\USER\.conda\envs\gtk-libs\Library\bin"
    )
    if not os.path.isdir(gtk_dir):
        return

    os.add_dll_directory(gtk_dir)

    conflict_markers = ("tesseract",)
    path_entries = [p for p in os.environ.get("PATH", "").split(os.pathsep) if p]
    clean_entries = [
        p
        for p in path_entries
        if os.path.normcase(p) != os.path.normcase(gtk_dir)
        and not any(marker in p.lower() for marker in conflict_markers)
    ]
    os.environ["PATH"] = os.pathsep.join([gtk_dir, *clean_entries])


_bootstrap_windows_dlls()

from jinja2 import Environment, FileSystemLoader, select_autoescape  # noqa: E402
from weasyprint import HTML  # noqa: E402

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)
_env.filters["score1"] = lambda v: f"{v:.1f}" if v is not None else "—"
_env.filters["pct"] = lambda v: f"{v * 20:.0f}%" if v is not None else "0%"  # /5 -> %
_env.filters["signed1"] = lambda v: f"{'+' if v > 0 else ''}{v:.1f}"


def _render_pdf_sync(template_name: str, context: dict) -> bytes:
    template = _env.get_template(template_name)
    html_string = template.render(**context, generated_at=datetime.now())
    return HTML(string=html_string, base_url=str(TEMPLATES_DIR)).write_pdf()


async def render_pdf(template_name: str, context: dict) -> bytes:
    """Render a Jinja2 template to PDF bytes off the event loop -- WeasyPrint
    is synchronous and CPU-bound, so this would otherwise block every other
    request for the duration of the render."""
    return await asyncio.to_thread(_render_pdf_sync, template_name, context)
