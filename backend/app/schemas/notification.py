"""Schemas for in-app notifications (see app.models.notification)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationRead(BaseModel):
    id: int
    type: str
    title: str
    message: str
    read: bool
    created_at: datetime
    circular_id: Optional[int] = None

    model_config = {"from_attributes": True}
