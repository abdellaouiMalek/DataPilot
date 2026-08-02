"""Schemas for the "Veille réglementaire" admin endpoints -- importing
regulatory circulars, reviewing their AI-extracted impacts, and publishing.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class ImpactRead(BaseModel):
    id: int
    requirement_text: str
    target_type: str
    target_description: str
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
    is_published: bool
    created_at: datetime
    impact_count: int
    pending_count: int

    model_config = {"from_attributes": True}


class CircularDetailRead(CircularRead):
    raw_text: Optional[str] = None
    impacts: list[ImpactRead] = []


class ImpactUpdate(BaseModel):
    # One of "accepté" / "modifié" / "rejeté", or null to reset to pending.
    action: Optional[str] = Field(default=None, max_length=20)
    edited_text: Optional[str] = None
