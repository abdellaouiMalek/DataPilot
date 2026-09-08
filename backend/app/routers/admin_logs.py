"""Audit-trail endpoints backing the "Historique & logs" back-office page.

Read-only by design: entries are written by the recorder in
``app.services.audit`` as a side effect of the actions being audited, never
through this router. Filtering, paging and the stat-card totals are all done
in SQL, the page is expected to grow well past what a client-side filter
could handle.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, time, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_super_admin
from app.db.database import get_db
from app.models.audit_log import (
    MODULES,
    STATUSES,
    STATUS_FAILURE,
    STATUS_SUCCESS,
    STATUS_WARNING,
    AuditLog,
)
from app.schemas.admin_log import AuditLogCounts, AuditLogPage, AuditLogRead

router = APIRouter(
    prefix="/api/super-admin/logs",
    tags=["super-admin-logs"],
    dependencies=[Depends(require_super_admin)],
)

MAX_PER_PAGE = 200


def _apply_filters(
    stmt: Select,
    *,
    q: Optional[str],
    module: Optional[str],
    date_from: Optional[str],
    date_to: Optional[str],
) -> Select:
    """Everything except the status filter, which the counts query omits."""
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(AuditLog.action).like(like),
                func.lower(AuditLog.actor_name).like(like),
                func.lower(AuditLog.module).like(like),
                func.lower(AuditLog.entity_label).like(like),
                func.lower(AuditLog.before).like(like),
                func.lower(AuditLog.after).like(like),
            )
        )
    if module:
        stmt = stmt.where(AuditLog.module == module)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= _day_start(date_from))
    if date_to:
        stmt = stmt.where(AuditLog.created_at <= _day_end(date_to))
    return stmt


def _day_start(value: str) -> datetime:
    return datetime.combine(datetime.fromisoformat(value).date(), time.min, timezone.utc)


def _day_end(value: str) -> datetime:
    """Inclusive upper bound: the <input type="date"> the UI sends means the
    whole day, not midnight."""
    return datetime.combine(datetime.fromisoformat(value).date(), time.max, timezone.utc)


@router.get("", response_model=AuditLogPage)
async def list_logs(
    q: Optional[str] = None,
    module: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=MAX_PER_PAGE),
    db: AsyncSession = Depends(get_db),
):
    base = _apply_filters(
        select(AuditLog), q=q, module=module, date_from=date_from, date_to=date_to
    )

    listed = base.where(AuditLog.status == status) if status else base
    total = await db.scalar(
        select(func.count()).select_from(listed.subquery())
    ) or 0

    rows = (
        (
            await db.execute(
                listed.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        )
        .scalars()
        .all()
    )

    by_status = await _counts_by_status(db, base)

    return AuditLogPage(
        items=[AuditLogRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        per_page=per_page,
        counts=AuditLogCounts(
            total=sum(by_status.values()),
            success=by_status.get(STATUS_SUCCESS, 0),
            warnings=by_status.get(STATUS_WARNING, 0),
            errors=by_status.get(STATUS_FAILURE, 0),
        ),
        modules=MODULES,
        statuses=STATUSES,
    )


async def _counts_by_status(db: AsyncSession, base: Select) -> dict[str, int]:
    sub = base.subquery()
    result = await db.execute(
        select(sub.c.status, func.count()).select_from(sub).group_by(sub.c.status)
    )
    return {status: count for status, count in result.all()}


@router.get("/export.csv")
async def export_logs(
    q: Optional[str] = None,
    module: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """The whole filtered set as CSV, what the page's "Exporter" button pulls."""
    stmt = _apply_filters(
        select(AuditLog), q=q, module=module, date_from=date_from, date_to=date_to
    )
    if status:
        stmt = stmt.where(AuditLog.status == status)

    rows = (
        (await db.execute(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())))
        .scalars()
        .all()
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        [
            "Référence",
            "Date",
            "Heure",
            "Utilisateur",
            "Email",
            "Module",
            "Action",
            "Statut",
            "Élément",
            "Avant",
            "Après",
            "IP",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                f"LOG-{r.id:04d}",
                r.created_at.strftime("%d/%m/%Y"),
                r.created_at.strftime("%H:%M"),
                r.actor_name,
                r.actor_email or "",
                r.module,
                r.action,
                r.status,
                r.entity_label,
                r.before,
                r.after,
                r.ip or "",
            ]
        )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    # BOM so Excel opens the accented French headers correctly.
    payload = "﻿" + buffer.getvalue()
    return StreamingResponse(
        iter([payload]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="datapilot-logs-{stamp}.csv"'
        },
    )
