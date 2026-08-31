"""Administrative notification emails.

Two rules shape what is worth sending.

**Only events the back-office does not cause itself.** A questionnaire can only
be published by a super admin, so a "published" notification could only tell
the recipient about their own action. A *submission*, on the other hand, comes
from a respondent and is invisible to the back-office until someone goes
looking — which is exactly what a notification is for.

**Never notify the actor.** Even on a shared event like account creation, the
person who just did it does not need an email about it; the address is only
worth mailing when somebody else acted. That check lives in ``_recipient`` so
it applies to every notification rather than being remembered per call site.

Fire-and-forget by design: these describe something that has already committed,
so a mail server being down must never turn a successful submission or account
creation into a failed request. Every send is wrapped and logged rather than
raised, and callers hand them to ``BackgroundTasks`` so the response does not
wait on SMTP.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from app.core.mailer import send_email
from app.db.database import AsyncSessionLocal
from app.models import PlatformSettings

logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "http://localhost:5173")


async def _recipient(field: str, actor_email: Optional[str]) -> str | None:
    """The configured address, if this notification is on and someone *else* acted.

    Reads on its own session: these run as background tasks, after the
    request's session has already been closed.
    """
    try:
        async with AsyncSessionLocal() as db:
            settings = await db.get(PlatformSettings, 1)
    except Exception:
        logger.exception("Notifications: could not read platform settings")
        return None

    if settings is None or not settings.notify_email:
        return None
    if not getattr(settings, field, False):
        return None
    if actor_email and actor_email.strip().lower() == settings.notify_email.lower():
        # The recipient is the one who performed the action.
        return None
    return settings.notify_email


async def _send(to: str, subject: str, body: str) -> None:
    try:
        await send_email(to, subject, body)
    except Exception:
        # Includes the 500 the mailer raises when SMTP is unconfigured.
        logger.exception("Notifications: sending %r to %s failed", subject, to)


async def notify_assessment_submitted(
    *,
    bank: str,
    score: Optional[float],
    maturity: Optional[str],
    department: Optional[str],
    actor_email: Optional[str] = None,
) -> None:
    to = await _recipient("notify_on_assessment", actor_email)
    if not to:
        return
    result = (
        f"{score:.1f}/5 · {maturity or '—'}" if score is not None else "non calculé"
    )
    await _send(
        to,
        f"DataPilot — nouvelle évaluation soumise ({bank})",
        f"Une évaluation vient d'être soumise sur la plateforme.\n\n"
        f"    Banque : {bank}\n"
        f"    Département : {department or 'non renseigné'}\n"
        f"    Score global : {result}\n\n"
        f"{APP_URL}\n\n"
        "Ce message a été généré automatiquement, merci de ne pas y répondre.",
    )


async def notify_user_created(
    *, email: str, role: str, author: str, actor_email: Optional[str] = None
) -> None:
    to = await _recipient("notify_on_new_user", actor_email)
    if not to:
        return
    await _send(
        to,
        "DataPilot — création d'un compte",
        f"Un compte vient d'être créé sur la plateforme.\n\n"
        f"    Compte : {email}\n"
        f"    Rôle : {role}\n"
        f"    Créé par : {author}\n\n"
        f"{APP_URL}\n\n"
        "Ce message a été généré automatiquement, merci de ne pas y répondre.",
    )
