"""Back-office dashboard — one aggregated read behind the whole landing page.

Nothing here is stored: every figure is a projection over data another module
already owns (assessments, banks, the published framework, the scoring bands,
the audit trail, Keycloak). The helpers those modules use are imported rather
than reimplemented, so a status string or a per-bank score can never disagree
between a tile here and the page it links to.

Keycloak is the one dependency that can be down without the rest being
meaningless, so it is queried defensively: when it fails, ``users_available``
comes back false and everything user-derived is omitted instead of being
reported as zero.
"""

from __future__ import annotations

import asyncio
import logging
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.core.keycloak_admin import kc_get
from app.db.database import get_db
from app.models import (
    Assessment,
    AuditLog,
    Bank,
    Question,
    QuestionnaireVersion,
)

# Deliberate reuse of the owning modules' private helpers: the dashboard has to
# agree with the pages it links to, and duplicating "what counts as active" or
# "which score is a bank's current one" is how the two drift apart.
from app.routers.admin_banks import _stats_by_bank
from app.routers.admin_banks import _status as bank_status
from app.routers.admin_users import (
    BUSINESS_ROLES,
    _bank_id as user_bank_id,
    _created_at as user_created_at,
    _role_by_user,
)
from app.routers.admin_users import _status as user_status
from app.schemas.admin_dashboard import (
    ActivityItem,
    BankRow,
    BankScore,
    DashboardKpis,
    DashboardRead,
    RoleSlice,
    TrendPoint,
)
from app.services import admin_alerts

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/super-admin/dashboard",
    tags=["super-admin-dashboard"],
    dependencies=[Depends(require_super_admin)],
)

# Trend ranges offered by the page's toggle: days for the two short ones,
# calendar months for the long one.
RANGE_DAYS = {"7d": 7, "30d": 30}
RANGE_MONTHS = {"12m": 12}
DEFAULT_RANGE = "12m"

MONTHS_FR = [
    "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
    "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
]

# Deltas on the KPI tiles are "over the last month".
DELTA_WINDOW_DAYS = 30

# Bars on the maturity chart and entries in the activity feed: both are
# glanceable summaries with a "voir tout" link, not lists.
MAX_BANK_BARS = 8
MAX_ACTIVITY = 8

# Slice for accounts holding none of the business roles — real users the donut
# would otherwise silently drop, making its centre total disagree with the tile.
ROLE_NONE = "none"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


# ── Trend ─────────────────────────────────────────────────────────────────────


def _buckets(range_key: str) -> tuple[list[Any], list[str], datetime, Any]:
    """(keys, labels, window start, key-of-datetime) for the requested range.

    Bucketing happens in Python rather than SQL: the windows are small, and the
    keys have to line up with a fixed set of labels anyway — a ``date_trunc``
    group-by only returns the buckets that have rows, which would collapse
    quiet days out of the chart instead of drawing them at zero.
    """
    today = _now().date()

    if range_key in RANGE_MONTHS:
        count = RANGE_MONTHS[range_key]
        keys = [
            _shift_month(today.year, today.month, -offset)
            for offset in reversed(range(count))
        ]
        labels = [MONTHS_FR[month - 1] for _, month in keys]
        first_year, first_month = keys[0]
        start = datetime(first_year, first_month, 1, tzinfo=timezone.utc)
        return keys, labels, start, lambda moment: (moment.year, moment.month)

    count = RANGE_DAYS[range_key]
    first = today - timedelta(days=count - 1)
    keys = [first + timedelta(days=offset) for offset in range(count)]
    labels = [day.strftime("%d/%m") for day in keys]
    start = datetime.combine(first, time.min, timezone.utc)
    return keys, labels, start, lambda moment: moment.date()


async def _trend(db: AsyncSession, range_key: str) -> list[TrendPoint]:
    keys, labels, start, key_of = _buckets(range_key)

    submissions = (
        await db.execute(
            select(Assessment.created_at, Assessment.bank_id).where(
                Assessment.created_at >= start
            )
        )
    ).all()
    openings = (
        await db.execute(select(Bank.created_at).where(Bank.created_at >= start))
    ).all()

    evaluations = {key: 0 for key in keys}
    evaluated_banks: dict[Any, set[int]] = {key: set() for key in keys}
    new_banks = {key: 0 for key in keys}

    for created_at, bank_id in submissions:
        key = key_of(created_at.astimezone(timezone.utc))
        if key in evaluations:
            evaluations[key] += 1
            evaluated_banks[key].add(bank_id)

    for (created_at,) in openings:
        if created_at is None:
            continue
        key = key_of(created_at.astimezone(timezone.utc))
        if key in new_banks:
            new_banks[key] += 1

    return [
        TrendPoint(
            label=label,
            evaluations=evaluations[key],
            banques=len(evaluated_banks[key]),
            nouvelles_banques=new_banks[key],
        )
        for key, label in zip(keys, labels)
    ]


# ── Keycloak ──────────────────────────────────────────────────────────────────


async def _keycloak_snapshot() -> Optional[tuple[list[dict], dict[str, str]]]:
    """Every user plus their business role, or None if Keycloak can't be read."""
    try:
        users, roles = await asyncio.gather(
            kc_get("/users", {"max": 1000}), _role_by_user()
        )
    except HTTPException:
        logger.warning(
            "Dashboard: Keycloak admin API unreachable — user metrics omitted"
        )
        return None
    return users, roles


def _role_slices(statuses: list[str], users: list[dict], roles: dict[str, str]):
    """Counted over accounts that still exist as such: an archived account is
    end-of-life, and showing it as a live seat overstates every role."""
    counts = Counter(
        roles.get(user["id"], ROLE_NONE)
        for user, status in zip(users, statuses)
        if status != "Archivé"
    )
    ordered = [*BUSINESS_ROLES, ROLE_NONE]
    return [
        RoleSlice(role=role, value=counts[role]) for role in ordered if counts[role]
    ]


# ── Framework ─────────────────────────────────────────────────────────────────


async def _previous_version(
    db: AsyncSession, active: QuestionnaireVersion
) -> Optional[QuestionnaireVersion]:
    stmt = (
        select(QuestionnaireVersion)
        .where(QuestionnaireVersion.number < active.number)
        .order_by(QuestionnaireVersion.number.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.get("", response_model=DashboardRead)
async def get_dashboard(
    range: str = Query(
        DEFAULT_RANGE,
        pattern="^(7d|30d|12m)$",
        description="Trend window: 7d / 30d (daily buckets) or 12m (monthly).",
    ),
    db: AsyncSession = Depends(get_db),
):
    since = _now() - timedelta(days=DELTA_WINDOW_DAYS)

    banks = list(
        (
            await db.execute(
                select(Bank)
                .where(Bank.archived.is_(False))
                .order_by(Bank.sort_order, Bank.id)
            )
        )
        .scalars()
        .all()
    )
    bank_stats = await _stats_by_bank(db)

    assessments_total = (
        await db.scalar(select(func.count()).select_from(Assessment)) or 0
    )
    assessments_recent = (
        await db.scalar(
            select(func.count())
            .select_from(Assessment)
            .where(Assessment.created_at >= since)
        )
        or 0
    )
    new_banks_recent = (
        await db.scalar(
            select(func.count()).select_from(Bank).where(Bank.created_at >= since)
        )
        or 0
    )

    active_version = await admin_alerts.active_version(db)
    if active_version is not None:
        questions = active_version.question_count
        previous = await _previous_version(db, active_version)
        questions_delta = questions - previous.question_count if previous else 0
        version_number = f"v{active_version.number}"
        version_label = active_version.label or "Publié"
    else:
        # Nothing published yet: fall back to the live framework so the tile
        # still says something true, and let the alert explain the situation.
        questions = (
            await db.scalar(
                select(func.count())
                .select_from(Question)
                .where(Question.is_active.is_(True))
            )
            or 0
        )
        questions_delta = 0
        version_number = None
        version_label = "Aucune version publiée"

    snapshot = await _keycloak_snapshot()
    if snapshot is None:
        active_users = 0
        new_users_recent = 0
        pending_users: Optional[int] = None
        roles_slices: list[RoleSlice] = []
        users_by_bank: Counter = Counter()
    else:
        users, roles = snapshot
        statuses = [user_status(user) for user in users]
        active_users = sum(1 for status in statuses if status == "Actif")
        pending_users = sum(1 for status in statuses if status == "En attente")
        new_users_recent = sum(
            1
            for user in users
            if (created := user_created_at(user)) is not None and created >= since
        )
        roles_slices = _role_slices(statuses, users, roles)
        users_by_bank = Counter(
            user_bank_id(user)
            for user, status in zip(users, statuses)
            if status != "Archivé" and user_bank_id(user) is not None
        )

    bank_rows = [
        BankRow(
            id=bank.id,
            name=bank.name,
            status=bank_status(bank),
            score=bank_stats.get(bank.id, {}).get("score"),
            users=None if snapshot is None else users_by_bank.get(bank.id, 0),
            last_assessment_at=bank_stats.get(bank.id, {}).get("last_at"),
        )
        for bank in banks
    ]

    bank_scores = sorted(
        (
            BankScore(name=row.name, score=row.score)
            for row in bank_rows
            if row.score is not None
        ),
        key=lambda entry: entry.score,
        reverse=True,
    )[:MAX_BANK_BARS]

    activity = list(
        (
            await db.execute(
                select(AuditLog)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .limit(MAX_ACTIVITY)
            )
        )
        .scalars()
        .all()
    )

    return DashboardRead(
        kpis=DashboardKpis(
            active_users=active_users,
            new_users_30d=new_users_recent,
            banks=len(banks),
            new_banks_30d=new_banks_recent,
            questions=questions,
            questions_delta=questions_delta,
            active_version=version_number,
            active_version_label=version_label,
            assessments=assessments_total,
            assessments_30d=assessments_recent,
        ),
        trend_range=range,
        trend=await _trend(db, range),
        roles=roles_slices,
        bank_scores=bank_scores,
        # The tiles already establish these three facts, so they are handed to
        # the checks rather than queried a second time.
        alerts=await admin_alerts.compute(
            db,
            admin_alerts.AlertInputs(
                active_version=active_version,
                pending_users=pending_users,
                banks_without_assessment=sum(
                    1 for row in bank_rows if row.last_assessment_at is None
                ),
            ),
        ),
        activity=[
            ActivityItem(
                id=entry.id,
                created_at=entry.created_at,
                module=entry.module,
                action=entry.action,
                actor_name=entry.actor_name,
                status=entry.status,
            )
            for entry in activity
        ],
        banks=bank_rows,
        users_available=snapshot is not None,
    )
