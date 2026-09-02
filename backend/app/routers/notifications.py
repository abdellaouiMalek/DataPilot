"""In-app notifications for the current user (see app.models.notification).

Any authenticated user can read/mark their OWN notifications -- no role
gate beyond ``verify_token``: the recipient is always the caller
(``claims["sub"]``), never a parameter, so there is nothing to see or
change beyond one's own list. Producers (e.g. publishing a "Veille
réglementaire" update, see app.services.notifications) decide WHO
receives a notification; this router only ever serves the caller's own.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_token
from app.db.database import get_db
from app.models import Notification
from app.schemas.notification import NotificationRead

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
):
    """Unread only, most recent first, capped at 50.

    The bell (see NotificationsPanel) treats "read" as "dismissed": once a
    notification is marked read -- by clicking it or via "tout marquer
    comme lu" -- it must never come back, on this device or any other.
    Filtering it out here rather than just style-fading it client-side is
    what makes that permanent; the row itself is kept (read=true) as a
    historical record, nothing is deleted."""
    user_id = claims.get("sub")
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id, Notification.read.is_(False))
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return (await db.execute(stmt)).scalars().all()


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_read(
    notification_id: int,
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
):
    notification = await db.get(Notification, notification_id)
    if notification is None or notification.user_id != claims.get("sub"):
        # Same 404 whether it doesn't exist or belongs to someone else --
        # never confirm another user's notification id exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification introuvable.")
    notification.read = True
    await db.commit()
    await db.refresh(notification)
    return notification


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    claims: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == claims.get("sub"), Notification.read.is_(False))
        .values(read=True)
    )
    await db.commit()
