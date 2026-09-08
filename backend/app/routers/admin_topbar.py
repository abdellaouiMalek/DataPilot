"""Endpoints behind the back-office topbar: the notification bell and the
quick search.

Both are deliberately read-only and cross-module. The bell merges two kinds of
thing an admin should not have to go looking for, configuration states that
are wrong right now (from ``app.services.admin_alerts``, the same checks the
dashboard card shows) and administrative actions that recently *failed*, which
are otherwise buried in the audit trail. The search resolves a few characters
into the record itself, wherever it lives, and tells the client what to type
into the destination page's own filter so the row is on screen on arrival.

There is no read/unread state stored here. Which notifications a given person
has already looked at is a per-user, per-device preference, not a fact about
the platform, so the client remembers it against the stable ``key``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import require_super_admin
from app.core.keycloak_admin import kc_get
from app.db.database import get_db
from app.models import (
    AuditLog,
    Bank,
    Dimension,
    Question,
    QuestionnaireVersion,
    SubDimension,
)
from app.models.audit_log import (
    MODULE_BANKS,
    MODULE_FRAMEWORK,
    MODULE_USERS,
    MODULE_VERSIONS,
    STATUS_FAILURE,
)
from app.schemas.admin_topbar import (
    NotificationRead,
    NotificationsRead,
    SearchHit,
    SearchResults,
)
from app.services import admin_alerts

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/super-admin",
    tags=["super-admin-topbar"],
    dependencies=[Depends(require_super_admin)],
)

# A failed action stops being news after a week; older ones live in the journal.
FAILURE_WINDOW_DAYS = 7
MAX_FAILURES = 5

# Per kind, so one prolific kind can't crowd the others out of the dropdown.
HITS_PER_KIND = 4

LEVEL_ORDER = {"critical": 0, "warning": 1, "info": 2}


# ── Notifications ─────────────────────────────────────────────────────────────


@router.get("/notifications", response_model=NotificationsRead)
async def list_notifications(db: AsyncSession = Depends(get_db)):
    inputs = await admin_alerts.gather_inputs(db)
    alerts = await admin_alerts.compute(db, inputs)

    items = [
        NotificationRead(
            key=f"cfg:{alert.code}",
            level=alert.level,
            module=alert.module,
            text=alert.text,
            action=alert.action,
            target=alert.target,
            created_at=None,
        )
        for alert in alerts
    ]

    since = datetime.now(timezone.utc) - timedelta(days=FAILURE_WINDOW_DAYS)
    failures = (
        (
            await db.execute(
                select(AuditLog)
                .where(AuditLog.status == STATUS_FAILURE, AuditLog.created_at >= since)
                .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .limit(MAX_FAILURES)
            )
        )
        .scalars()
        .all()
    )
    items.extend(
        NotificationRead(
            key=f"log:{entry.id}",
            level="critical",
            module=entry.module,
            text=f"Action refusée, {entry.action}",
            action="Consulter",
            target="logs",
            created_at=entry.created_at,
        )
        for entry in failures
    )

    # Severity first, then the dated ones newest-first within a severity.
    items.sort(
        key=lambda item: (
            LEVEL_ORDER[item.level],
            -(item.created_at.timestamp() if item.created_at else 0),
        )
    )
    return NotificationsRead(
        items=items, users_available=inputs.pending_users is not None
    )


# ── Quick search ──────────────────────────────────────────────────────────────


def _like(value: str) -> str:
    # Escape the wildcards so a literal % or _ typed by the admin matches
    # itself instead of turning into "match anything".
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped.lower()}%"


async def _bank_hits(db: AsyncSession, term: str) -> list[SearchHit]:
    stmt = (
        select(Bank)
        .where(
            or_(
                func.lower(Bank.name).like(term, escape="\\"),
                func.lower(Bank.sector).like(term, escape="\\"),
                func.lower(Bank.country).like(term, escape="\\"),
            )
        )
        # Live banks before archived ones: an admin searching a name almost
        # always means the one still in use.
        .order_by(Bank.archived, Bank.sort_order, Bank.id)
        .limit(HITS_PER_KIND)
    )
    return [
        SearchHit(
            kind="bank",
            label="Banques",
            module=MODULE_BANKS,
            title=bank.name,
            subtitle=" · ".join(
                part for part in (bank.sector, bank.country) if part
            )
            or "Secteur non renseigné",
            target="banks",
            seed=bank.name,
        )
        for bank in (await db.execute(stmt)).scalars().all()
    ]


async def _dimension_hits(db: AsyncSession, term: str) -> list[SearchHit]:
    stmt = (
        select(Dimension)
        .where(
            Dimension.is_active.is_(True),
            or_(
                func.lower(Dimension.name).like(term, escape="\\"),
                func.lower(Dimension.short_name).like(term, escape="\\"),
                func.lower(Dimension.description).like(term, escape="\\"),
            ),
        )
        .order_by(Dimension.sort_order, Dimension.id)
        .limit(HITS_PER_KIND)
    )
    return [
        SearchHit(
            kind="dimension",
            label="Dimensions",
            module=MODULE_FRAMEWORK,
            title=dimension.name,
            subtitle=f"Dimension {dimension.code} · poids {dimension.weight:g}",
            target="dimensions",
            seed=dimension.name,
        )
        for dimension in (await db.execute(stmt)).scalars().all()
    ]


async def _subdimension_hits(db: AsyncSession, term: str) -> list[SearchHit]:
    stmt = (
        select(SubDimension)
        .options(selectinload(SubDimension.dimension))
        .where(
            SubDimension.is_active.is_(True),
            func.lower(SubDimension.name).like(term, escape="\\"),
        )
        .order_by(SubDimension.sort_order, SubDimension.id)
        .limit(HITS_PER_KIND)
    )
    return [
        SearchHit(
            kind="subdimension",
            label="Sous-dimensions",
            module=MODULE_FRAMEWORK,
            title=sub.name,
            subtitle=sub.dimension.name if sub.dimension else "Sous-dimension",
            target="dimensions",
            seed=sub.name,
        )
        for sub in (await db.execute(stmt)).scalars().all()
    ]


async def _question_hits(db: AsyncSession, term: str) -> list[SearchHit]:
    stmt = (
        select(Question)
        .where(
            Question.is_active.is_(True),
            or_(
                func.lower(Question.text).like(term, escape="\\"),
                func.lower(Question.description).like(term, escape="\\"),
            ),
        )
        .order_by(Question.sort_order, Question.id)
        .limit(HITS_PER_KIND)
    )
    questions = list((await db.execute(stmt)).scalars().all())
    if not questions:
        return []

    # One lookup for the labels rather than a lazy load per row.
    names = dict(
        (
            await db.execute(
                select(Dimension.id, Dimension.name).where(
                    Dimension.id.in_({question.dimension_id for question in questions})
                )
            )
        ).all()
    )
    return [
        SearchHit(
            kind="question",
            label="Questions",
            module=MODULE_FRAMEWORK,
            title=question.text,
            subtitle=names.get(question.dimension_id, "Question"),
            target="dimensions",
            # The framework page filters questions on their wording, so the
            # question's own text is what puts this row on screen.
            seed=question.text,
        )
        for question in questions
    ]


async def _version_hits(db: AsyncSession, term: str, raw: str) -> list[SearchHit]:
    conditions = [
        func.lower(QuestionnaireVersion.label).like(term, escape="\\"),
        func.lower(QuestionnaireVersion.note).like(term, escape="\\"),
    ]
    # "v3" and "3" should both find version 3, the number is what the UI
    # displays, so it is the most likely thing to be typed.
    digits = raw.lstrip("vV")
    if digits.isdigit():
        conditions.append(QuestionnaireVersion.number == int(digits))

    stmt = (
        select(QuestionnaireVersion)
        .where(or_(*conditions))
        .order_by(QuestionnaireVersion.number.desc())
        .limit(HITS_PER_KIND)
    )
    hits = []
    for version in (await db.execute(stmt)).scalars().all():
        state = (
            "Active"
            if version.is_active
            else "Archivée"
            if version.archived
            else "Enregistrée"
        )
        hits.append(
            SearchHit(
                kind="version",
                label="Versions",
                module=MODULE_VERSIONS,
                title=f"v{version.number}" + (f": {version.label}" if version.label else ""),
                subtitle=f"{state} · {version.question_count} questions",
                target="versions",
                seed=version.label or f"v{version.number}",
            )
        )
    return hits


async def _user_hits(raw: str) -> Optional[list[SearchHit]]:
    """None when Keycloak is unreachable, distinct from "no account matches"."""
    try:
        users = await kc_get("/users", {"search": raw, "max": HITS_PER_KIND})
    except HTTPException:
        logger.warning("Quick search: Keycloak unreachable, accounts not searched")
        return None

    hits = []
    for user in users:
        name = " ".join(
            part for part in (user.get("firstName"), user.get("lastName")) if part
        )
        identifier = user.get("email") or user.get("username") or ""
        hits.append(
            SearchHit(
                kind="user",
                label="Utilisateurs",
                module=MODULE_USERS,
                title=name or identifier or "Compte sans nom",
                subtitle=identifier or "Aucune adresse",
                target="users",
                seed=identifier or name,
            )
        )
    return hits


@router.get("/search", response_model=SearchResults)
async def quick_search(
    q: str = Query(min_length=2, max_length=100),
    db: AsyncSession = Depends(get_db),
):
    raw = q.strip()
    term = _like(raw)

    users = await _user_hits(raw)
    hits: list[SearchHit] = []
    # Ordered by how specific a match tends to be, since the dropdown keeps
    # this order: a named record first, framework wording last.
    hits.extend(await _bank_hits(db, term))
    hits.extend(users or [])
    hits.extend(await _dimension_hits(db, term))
    hits.extend(await _subdimension_hits(db, term))
    hits.extend(await _question_hits(db, term))
    hits.extend(await _version_hits(db, term, raw))

    return SearchResults(query=raw, hits=hits, users_available=users is not None)
