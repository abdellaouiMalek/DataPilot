"""Schemas for the staged framework editor and its published versions.

The tree travels as loosely-typed nodes on purpose: the admin page owns the
shape (it round-trips exactly what ``GET /framework/tree`` gave it, plus its
own temporary ids for new rows), and the reconciliation in
``app.services.framework_publish`` reads the fields it needs. Pinning a strict
model here would mean editing three files every time the question editor grows
a field.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class DraftSave(BaseModel):
    tree: list[dict[str, Any]]
    base_version_id: Optional[int] = None


class DraftRead(BaseModel):
    tree: list[dict[str, Any]]
    base_version_id: Optional[int] = None
    updated_by_sub: Optional[str] = None
    updated_by_name: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PublishRequest(BaseModel):
    tree: list[dict[str, Any]]
    label: str = Field(default="", max_length=200)
    note: str = ""
    # Version the edits were started from; a mismatch means someone else
    # published meanwhile and this publish would silently overwrite them.
    base_version_id: Optional[int] = None


class ChangelogEntry(BaseModel):
    kind: str
    label: str
    details: list[str] = []


class VersionEdit(BaseModel):
    """Metadata an admin can still fix after publishing.

    Deliberately limited to the label and the note: the snapshot and the
    computed changelog are what make a version worth keeping, so they stay
    immutable.
    """

    label: str = Field(default="", max_length=200)
    note: str = ""


class VersionArchivedUpdate(BaseModel):
    archived: bool


class VersionSummary(BaseModel):
    id: int
    number: int
    # True for the version currently applied to the live framework tables.
    is_active: bool = False
    # Retired from the log's default view. Never true for the live version.
    archived: bool = False
    label: str
    note: str
    changelog: list[ChangelogEntry]
    dimension_count: int
    question_count: int
    # How many assessments were answered on this version. Not a column --
    # counted per request -- and the reason a version can be undeletable.
    assessment_count: int = 0
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class VersionDetail(VersionSummary):
    snapshot: dict[str, Any]


class FrameworkState(BaseModel):
    """One round-trip for the editor: what's live, what's staged, where we are."""

    tree: list[dict[str, Any]]
    draft: Optional[DraftRead] = None
    # The version the live tables currently hold -- what edits are based on and
    # what a publish must not have raced against. Not necessarily the newest.
    active_version: Optional[VersionSummary] = None
