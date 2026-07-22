"""Schemas for the admin bank-management endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class BankAdminRead(BaseModel):
    id: int
    name: str
    country: str
    sector: str
    contact: Optional[str]
    description: str
    is_active: bool
    archived: bool
    # Derived lifecycle + evaluation state: Archivé / Désactivé / Actif / En attente
    status: str
    created_at: Optional[datetime]
    # Stats computed from assessments
    score: Optional[float]           # latest assessment's global score
    assessments_count: int
    last_assessment_at: Optional[datetime]

    model_config = {"from_attributes": True}


class BankCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    country: str = Field(default="", max_length=100)
    sector: str = Field(default="", max_length=200)
    contact: Optional[str] = Field(default=None, max_length=200)
    description: str = Field(default="", max_length=2000)


class BankUpdate(BankCreate):
    pass


class BankActiveUpdate(BaseModel):
    is_active: bool


class BankArchivedUpdate(BaseModel):
    archived: bool
