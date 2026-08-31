"""Schemas for the back-office topbar — the notification bell and the quick search.

Both are cross-module by nature: they read whatever the admin might need to
react to or jump to, wherever it lives. Neither stores anything.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NotificationRead(BaseModel):
    """One item in the bell's list."""

    #: Stable across polls, so the client can remember what has been seen.
    #: ``cfg:<alert code>`` for a configuration state, ``log:<id>`` for a
    #: failed action from the audit trail.
    key: str
    #: "critical" | "warning" | "info"
    level: str
    #: Functional area, in the audit trail's module vocabulary — the client
    #: reuses the icon it already maps for that module.
    module: str
    text: str
    #: Label of the call-to-action ("Activer", "Consulter"…).
    action: str
    #: Key of the back-office page the action navigates to.
    target: str
    #: When it happened. None for configuration states, which are conditions
    #: that hold right now rather than events with a moment.
    created_at: Optional[datetime]


class NotificationsRead(BaseModel):
    items: list[NotificationRead]
    #: False when Keycloak could not be reached: the user-related checks were
    #: skipped, so an empty list does not mean "nothing to report".
    users_available: bool


class SearchHit(BaseModel):
    """One quick-search result."""

    #: "bank" | "user" | "dimension" | "subdimension" | "question" | "version"
    kind: str
    #: French label for the kind, shown as the group heading ("Banques").
    label: str
    #: Audit module vocabulary, for the icon.
    module: str
    title: str
    subtitle: str
    #: Key of the back-office page holding this record.
    target: str
    #: Text to pre-fill the target page's own search box with, so the record
    #: is actually on screen on arrival rather than merely on that page.
    seed: str


class SearchResults(BaseModel):
    query: str
    hits: list[SearchHit]
    #: False when Keycloak is unreachable — accounts were not searched.
    users_available: bool
