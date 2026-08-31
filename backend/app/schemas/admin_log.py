"""Schemas for the audit-trail endpoints (Historique & logs)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: int
    created_at: datetime
    actor_name: str
    actor_email: Optional[str]
    module: str
    action: str
    status: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    entity_label: str
    before: str
    after: str
    details: Optional[dict[str, Any]]
    ip: Optional[str]

    model_config = {"from_attributes": True}


class AuditLogCounts(BaseModel):
    """Totals behind the four stat cards, computed over the active filters
    minus the status one -- so switching "Échec" on doesn't collapse every
    card to the same number."""

    total: int
    success: int
    warnings: int
    errors: int


class AuditLogPage(BaseModel):
    items: list[AuditLogRead]
    total: int
    page: int
    per_page: int
    counts: AuditLogCounts
    # Filter vocabularies, so the UI doesn't hardcode them.
    modules: list[str]
    statuses: list[str]
