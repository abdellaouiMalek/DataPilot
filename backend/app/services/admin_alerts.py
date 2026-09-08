"""Configuration checks over the platform's own settings.

Shared by two surfaces that must never disagree: the dashboard's "Alertes de
configuration" card and the topbar's notification bell. Each check answers
"is something misconfigured right now?", these are *states*, not events, so
they carry no timestamp and disappear on their own once fixed.

Every alert carries a stable ``code``. The wording and the counts in ``text``
change as the data does, but the code identifies the condition, which is what
lets the bell remember that a notification has already been seen.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.keycloak_admin import kc_get
from app.models import (
    Assessment,
    Bank,
    Dimension,
    FrameworkDraft,
    MaturityLevel,
    Question,
    QuestionnaireVersion,
    SubDimension,
)
from app.models.audit_log import (
    MODULE_BANKS,
    MODULE_FRAMEWORK,
    MODULE_SCORING,
    MODULE_USERS,
    MODULE_VERSIONS,
)

# Deliberate reuse of the owning modules' helpers: an alert that contradicts
# the page it links to is worse than no alert at all.
from app.routers.admin_scoring import _gaps, _overlaps
from app.routers.admin_users import _status as user_status
from app.schemas.admin_dashboard import DashboardAlert

logger = logging.getLogger(__name__)

MAX_ALERTS = 8

ALERT_ORDER = {"critical": 0, "warning": 1, "info": 2}

# A draft this old stops being "in progress" and starts being forgotten work.
STALE_DRAFT_DAYS = 7


@dataclass
class AlertInputs:
    """The three facts the checks need that callers often already hold.

    The dashboard computes all of them for its own tiles, so it passes them in
    rather than paying for the queries twice; anything else calls
    :func:`gather_inputs`.
    """

    active_version: Optional[QuestionnaireVersion]
    #: None when Keycloak could not be reached, distinct from "nobody is
    #: waiting", so the check stays silent instead of claiming all is well.
    pending_users: Optional[int]
    banks_without_assessment: int


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _plural(count: int, singular: str, plural: Optional[str] = None) -> str:
    return singular if count == 1 else (plural or f"{singular}s")


async def active_version(db: AsyncSession) -> Optional[QuestionnaireVersion]:
    stmt = select(QuestionnaireVersion).where(QuestionnaireVersion.is_active.is_(True))
    return (await db.execute(stmt)).scalars().first()


async def pending_user_count() -> Optional[int]:
    """Accounts created but never activated. None if Keycloak is unreachable."""
    try:
        users = await kc_get("/users", {"max": 1000})
    except HTTPException:
        logger.warning("Alerts: Keycloak unreachable, pending-user check skipped")
        return None
    return sum(1 for user in users if user_status(user) == "En attente")


async def banks_without_assessment_count(db: AsyncSession) -> int:
    stmt = (
        select(func.count())
        .select_from(Bank)
        .where(
            Bank.archived.is_(False),
            ~select(Assessment.id)
            .where(Assessment.bank_id == Bank.id)
            .exists(),
        )
    )
    return await db.scalar(stmt) or 0


async def gather_inputs(db: AsyncSession) -> AlertInputs:
    return AlertInputs(
        active_version=await active_version(db),
        pending_users=await pending_user_count(),
        banks_without_assessment=await banks_without_assessment_count(db),
    )


async def compute(db: AsyncSession, inputs: AlertInputs) -> list[DashboardAlert]:
    """Every triggered check, most severe first.

    An empty list means the platform is correctly configured, a result worth
    stating, so callers render it rather than hiding the card.
    """
    alerts: list[DashboardAlert] = []

    if inputs.pending_users:
        count = inputs.pending_users
        alerts.append(
            DashboardAlert(
                code="users.pending",
                module=MODULE_USERS,
                level="critical",
                text=(
                    f"{count} {_plural(count, 'utilisateur')} en attente d'activation"
                ),
                action="Activer",
                target="users",
            )
        )

    if inputs.active_version is None:
        alerts.append(
            DashboardAlert(
                code="versions.none",
                module=MODULE_VERSIONS,
                level="critical",
                text="Aucune version du questionnaire n'est publiée",
                action="Publier",
                target="versions",
            )
        )

    draft = await db.get(FrameworkDraft, 1)
    if draft is not None:
        days = (_now() - draft.updated_at.astimezone(timezone.utc)).days
        age = f"modifié il y a {days} j" if days >= 1 else "modifié aujourd'hui"
        alerts.append(
            DashboardAlert(
                code="versions.draft",
                module=MODULE_VERSIONS,
                level="warning" if days >= STALE_DRAFT_DAYS else "info",
                text=f"Brouillon du questionnaire non publié, {age}",
                action="Publier",
                target="versions",
            )
        )

    levels = list(
        (
            await db.execute(
                select(MaturityLevel).order_by(
                    MaturityLevel.sort_order, MaturityLevel.id
                )
            )
        )
        .scalars()
        .all()
    )
    overlaps = _overlaps(levels)
    if overlaps:
        alerts.append(
            DashboardAlert(
                code="scoring.overlaps",
                module=MODULE_SCORING,
                level="critical",
                # An overlap makes the mapper return the *wrong* label, where a
                # gap only costs a missing one, hence the higher severity.
                text=(
                    f"{len(overlaps)} {_plural(len(overlaps), 'chevauchement')} "
                    "entre niveaux de maturité"
                ),
                action="Corriger",
                target="scoring",
            )
        )
    gaps = _gaps(levels)
    if gaps:
        alerts.append(
            DashboardAlert(
                code="scoring.gaps",
                module=MODULE_SCORING,
                level="warning",
                text=(
                    f"{len(gaps)} {_plural(len(gaps), 'plage')} de score sans "
                    "niveau de maturité"
                ),
                action="Configurer",
                target="scoring",
            )
        )

    unweighted_dimensions = await db.scalar(
        select(func.count())
        .select_from(Dimension)
        .where(Dimension.is_active.is_(True), Dimension.weight <= 0)
    )
    if unweighted_dimensions:
        mark = "s" if unweighted_dimensions > 1 else ""
        alerts.append(
            DashboardAlert(
                code="dimensions.unweighted",
                module=MODULE_FRAMEWORK,
                level="warning",
                # weighted_average drops zero-weight entries, so such a
                # dimension contributes nothing at all to the global score.
                text=(
                    f"{unweighted_dimensions} "
                    f"{_plural(unweighted_dimensions, 'dimension')} sans "
                    f"pondération, exclue{mark} du score global"
                ),
                action="Pondérer",
                target="dimensions",
            )
        )

    unweighted_questions = await db.scalar(
        select(func.count())
        .select_from(Question)
        .where(Question.is_active.is_(True), Question.weight <= 0)
    )
    if unweighted_questions:
        alerts.append(
            DashboardAlert(
                code="questions.unweighted",
                module=MODULE_FRAMEWORK,
                level="warning",
                text=(
                    f"{unweighted_questions} "
                    f"{_plural(unweighted_questions, 'question')} sans pondération"
                ),
                action="Pondérer",
                target="dimensions",
            )
        )

    undocumented = await db.scalar(
        select(func.count())
        .select_from(Question)
        .where(
            Question.is_active.is_(True),
            or_(Question.description.is_(None), func.btrim(Question.description) == ""),
        )
    )
    if undocumented:
        alerts.append(
            DashboardAlert(
                code="questions.undocumented",
                module=MODULE_FRAMEWORK,
                level="info",
                text=(
                    f"{undocumented} {_plural(undocumented, 'question')} sans "
                    "description d'aide"
                ),
                action="Compléter",
                target="dimensions",
            )
        )

    empty_subdimensions = await db.scalar(
        select(func.count())
        .select_from(SubDimension)
        .where(
            SubDimension.is_active.is_(True),
            ~select(Question.id)
            .where(
                Question.sub_dimension_id == SubDimension.id,
                Question.is_active.is_(True),
            )
            .exists(),
        )
    )
    if empty_subdimensions:
        alerts.append(
            DashboardAlert(
                code="subdimensions.empty",
                module=MODULE_FRAMEWORK,
                level="info",
                text=(
                    f"{empty_subdimensions} "
                    f"{_plural(empty_subdimensions, 'sous-dimension')} sans question"
                ),
                action="Compléter",
                target="dimensions",
            )
        )

    if inputs.banks_without_assessment:
        count = inputs.banks_without_assessment
        alerts.append(
            DashboardAlert(
                code="banks.unevaluated",
                module=MODULE_BANKS,
                level="info",
                text=f"{count} {_plural(count, 'banque')} sans évaluation",
                action="Consulter",
                target="banks",
            )
        )

    alerts.sort(key=lambda alert: ALERT_ORDER[alert.level])
    return alerts[:MAX_ALERTS]
