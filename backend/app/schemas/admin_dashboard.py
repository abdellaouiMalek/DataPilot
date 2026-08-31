"""Schemas for the back-office dashboard (`/api/super-admin/dashboard`).

One response feeds the whole page: the five KPI tiles, the trend chart, the
role donut, the per-bank bar chart, the configuration alerts, the activity
feed and the banks table. It is a read-only projection over data that already
exists elsewhere (assessments, banks, the published framework, the audit
trail, Keycloak) — nothing here is stored.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DashboardKpis(BaseModel):
    """The five tiles on the top row.

    Each pairs a value with the delta shown in its pill. Deltas are counts over
    the trailing 30 days, except the framework ones which compare the active
    published version with the one before it.
    """

    active_users: int
    new_users_30d: int

    banks: int
    new_banks_30d: int

    #: Question count of the active published version — what respondents
    #: actually see — not the live (possibly edited) framework tables.
    questions: int
    #: Against the previously published version. 0 when there is only one.
    questions_delta: int

    #: "v3", or None while nothing has been published yet.
    active_version: Optional[str]
    #: The admin's label for that version ("Édition 2026"), else "Publié".
    active_version_label: str

    assessments: int
    assessments_30d: int


class TrendPoint(BaseModel):
    """One bucket of the trend chart — a day (7/30 days) or a month (12 months)."""

    label: str
    evaluations: int
    #: Distinct banks that submitted at least once in the bucket.
    banques: int
    #: Banks whose account was created in the bucket.
    nouvelles_banques: int


class RoleSlice(BaseModel):
    """One slice of the user donut. ``role`` is the Keycloak realm role, so the
    UI can reuse the labels it already maps for the users page."""

    role: str
    value: int


class BankScore(BaseModel):
    """One bar of the maturity chart — a bank's most recent global score."""

    name: str
    score: float


class DashboardAlert(BaseModel):
    """A configuration problem the page surfaces with a link to go fix it."""

    #: Stable identifier for the condition ("users.pending"). The wording and
    #: counts in ``text`` move with the data; this does not, which is what
    #: lets the topbar bell remember an alert has already been seen.
    code: str
    #: Functional area, using the audit trail's module vocabulary — so both
    #: surfaces can pick the icon they already map for that module.
    module: str
    #: "critical" | "warning" | "info"
    level: str
    text: str
    #: Label of the call-to-action button ("Activer", "Publier"…).
    action: str
    #: Key of the back-office page the action navigates to (see `pageRoutes`).
    target: str


class ActivityItem(BaseModel):
    """An audit-trail entry, trimmed to what the feed renders."""

    id: int
    created_at: datetime
    module: str
    action: str
    actor_name: str
    status: str


class BankRow(BaseModel):
    """One row of the banks table."""

    id: int
    name: str
    status: str
    #: Most recent global score, None when the bank has never been evaluated.
    score: Optional[float]
    #: Accounts carrying this bank's id in Keycloak. None when Keycloak is
    #: unreachable — the column shows "—" rather than a misleading 0.
    users: Optional[int]
    last_assessment_at: Optional[datetime]


class DashboardRead(BaseModel):
    kpis: DashboardKpis
    #: Echoed back so the chart can't render one range under another's label.
    trend_range: str
    trend: list[TrendPoint]
    roles: list[RoleSlice]
    bank_scores: list[BankScore]
    alerts: list[DashboardAlert]
    activity: list[ActivityItem]
    banks: list[BankRow]
    #: False when the Keycloak admin API could not be reached: everything
    #: user-derived (the tile, the donut, the table column) is unknown rather
    #: than zero, and the page says so instead of showing empty charts.
    users_available: bool
