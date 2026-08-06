"""Schemas for the "Veille réglementaire" admin endpoints -- importing
regulatory circulars, polling their (background) AI analysis, reviewing
the proposed impacts, and publishing.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ImpactRead(BaseModel):
    id: int
    excerpt: str
    # Texte original (langue source) correspondant à `excerpt`, si la
    # circulaire a été traduite (arabe -> français) -- None sinon.
    excerpt_original: Optional[str] = None
    requirement_text: str
    entity_type: str
    proposed_action: str
    proposed_data: dict[str, Any]
    action: Optional[str] = None
    edited_text: Optional[str] = None

    model_config = {"from_attributes": True}


class CircularRead(BaseModel):
    id: int
    reference: str
    publication_date: Optional[date] = None
    theme: str
    status: str
    version: str
    source_filename: Optional[str] = None
    source_url: Optional[str] = None
    detected_language: Optional[str] = None
    analysis_status: str
    analysis_error: Optional[str] = None
    is_published: bool
    created_at: datetime
    impact_count: int
    pending_count: int

    model_config = {"from_attributes": True}


class CircularDetailRead(CircularRead):
    # Texte ANALYSÉ (français) -- ce qu'affiche l'admin par défaut, même
    # pour une circulaire arabe (voir services/regulatory.py).
    raw_text: Optional[str] = None
    # Texte langue SOURCE, uniquement renseigné si une traduction a eu lieu.
    raw_text_original: Optional[str] = None
    impacts: list[ImpactRead] = []


class ImpactUpdate(BaseModel):
    # One of "accepté" / "modifié" / "rejeté", or null to reset to pending.
    action: Optional[str] = Field(default=None, max_length=20)
    edited_text: Optional[str] = None
