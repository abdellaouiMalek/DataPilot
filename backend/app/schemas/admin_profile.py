"""Schemas for the back-office account page (`/api/back-office/profile`).

Only what is *specific to an administrator account* lives here. The editable
identity fields (name, email, organisation) are not duplicated, they are read
and written through ``/api/profile``, the same self-service endpoint every
authenticated user has, so there is exactly one place that writes a person's
own details into Keycloak.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProfileActivityItem(BaseModel):
    """One of the administrator's own entries in the audit trail."""

    id: int
    created_at: datetime
    module: str
    action: str
    status: str
    entity_label: str

    model_config = {"from_attributes": True}


class AdminProfileOverview(BaseModel):
    """Back-office context for the signed-in administrator.

    Everything here is read-only: it describes the account as the platform
    sees it, which is precisely what the self-service form cannot tell you.
    """

    id: str
    username: Optional[str]
    email: Optional[str]
    #: Keycloak realm role ("super_admin"); None if the account holds none of
    #: the business roles.
    role: Optional[str]
    #: False while the account has never confirmed its address, the same
    #: signal the users page renders as "En attente".
    email_verified: bool
    created_at: Optional[datetime]
    #: Most recent LOGIN event. None when Keycloak's event log is unavailable
    #: or has expired past its retention window, unknown, not "never".
    last_login: Optional[datetime]

    #: Totals over the audit trail, attributed by the Keycloak `sub` rather
    #: than by name, so a rename never detaches an admin from their history.
    actions_total: int
    actions_30d: int
    last_action_at: Optional[datetime]
    recent_actions: list[ProfileActivityItem]


class PasswordResetResult(BaseModel):
    """Outcome of the self-service password reset."""

    sent: bool
    email: Optional[str]
