"""Administrative notification emails.

Two rules shape what is worth sending.

**Only events the back-office does not cause itself.** A questionnaire can only
be published by a super admin, so a "published" notification could only tell
the recipient about their own action. A *submission*, on the other hand, comes
from a respondent and is invisible to the back-office until someone goes
looking, which is exactly what a notification is for.

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

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.keycloak_admin import kc_get
from app.core.mailer import send_email
from app.db.database import AsyncSessionLocal
from app.models import Notification, PlatformSettings
from app.models.framework_version import QuestionnaireVersion
from app.models.regulatory import RegulatoryCircular

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
        f"{score:.1f}/5 · {maturity or '-'}" if score is not None else "non calculé"
    )
    await _send(
        to,
        f"DataPilot · nouvelle évaluation soumise ({bank})",
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
        "DataPilot · création d'un compte",
        f"Un compte vient d'être créé sur la plateforme.\n\n"
        f"    Compte : {email}\n"
        f"    Rôle : {role}\n"
        f"    Créé par : {author}\n\n"
        f"{APP_URL}\n\n"
        "Ce message a été généré automatiquement, merci de ne pas y répondre.",
    )


async def notify_admins_of_publication(
    db: AsyncSession, circular: RegulatoryCircular
) -> None:
    """Queue one in-app notification per ``admin`` user for a published circular.

    Unlike the email notifications above this one writes rows, and it does so
    on the caller's session without committing: the publication and its
    notifications share a transaction, so a circular can never be published
    without the admins hearing about it (see the call site in
    ``app.routers.regulatory``).

    The recipient list comes from Keycloak, which is reachable over the
    network and therefore allowed to fail: a publication is far too expensive
    to roll back because the identity server blinked. On failure nobody is
    notified and the publication still stands.
    """
    try:
        members = await kc_get("/roles/admin/users", {"max": 1000})
    except Exception:
        logger.exception(
            "Notifications: could not list admins for circular %s", circular.id
        )
        return

    reference = circular.reference or f"circulaire #{circular.id}"
    for member in members:
        user_id = member.get("id")
        if not user_id:
            continue
        db.add(
            Notification(
                user_id=user_id,
                type="info",
                title="Nouvelle veille réglementaire publiée",
                message=(
                    f"{reference} est désormais en vigueur "
                    f"({circular.version}). Le questionnaire a été mis à jour."
                ),
                circular_id=circular.id,
            )
        )


async def notify_admins_of_new_questionnaire_version(
    db: AsyncSession, version: QuestionnaireVersion
) -> None:
    """Queue one in-app notification per ``admin`` user for a newly
    published questionnaire version.

    Same shape and same transaction-sharing contract as
    ``notify_admins_of_publication`` above (see its docstring) -- written
    on the caller's session without committing, from
    ``app.routers.admin_framework``'s ``publish`` endpoint, so a version
    can never go live without the admins hearing about it.

    Deliberately no ``circular_id`` (left ``None``, "purely informative"
    per ``NotificationsPanel.tsx``'s own comment): a ``QuestionnaireVersion``
    is a different table than ``RegulatoryCircular``, so it can't reuse that
    column's FK, and the existing click-through navigation
    (``AdminTopbar.tsx``'s ``openCircularFromNotification``) is wired
    specifically to the circular detail route -- reusing it here would send
    an admin to the wrong resource. An admin who wants to see the change
    already has "Versions du questionnaire" in their own sidebar
    (``/admin/versions``, now readable by this role -- see
    ``app.routers.admin_framework``), so the notification's job is only to
    tell them a version now exists, not to deep-link into it.
    """
    try:
        members = await kc_get("/roles/admin/users", {"max": 1000})
    except Exception:
        logger.exception(
            "Notifications: could not list admins for version %s", version.id
        )
        return

    label = version.label.strip() if version.label else f"v{version.number}"
    changes = len(version.changelog or [])
    for member in members:
        user_id = member.get("id")
        if not user_id:
            continue
        db.add(
            Notification(
                user_id=user_id,
                type="info",
                title="Nouvelle version du questionnaire publiée",
                message=(
                    f"{label} est désormais la version active "
                    f"({changes} changement{'s' if changes != 1 else ''}). "
                    "Consultez « Versions du questionnaire » pour le détail."
                ),
            )
        )
