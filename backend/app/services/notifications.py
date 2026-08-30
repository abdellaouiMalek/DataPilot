"""In-app notifications for back-office users.

Producers call ``notify_users`` (generic) or a specific helper like
``notify_admins_of_publication``; readers use ``app.routers.notifications``.
Identity/roles live entirely in Keycloak (no local users table, see
``app.routers.admin_users``), so fan-out queries Keycloak's realm-role
member list the same way ``admin_users._role_by_user`` already does.
"""

from __future__ import annotations

from app.core.keycloak_admin import kc_get
from app.models import Notification, RegulatoryCircular
from sqlalchemy.ext.asyncio import AsyncSession

# Le rôle "admin" (back-office réduit -- tableau de bord + gestion des
# utilisateurs, voir app.core.auth) est le destinataire de cette
# notification, PAS "super_admin" (qui vient de publier) : la publication
# d'une nouvelle version du référentiel les concerne (utilisateurs à
# réévaluer, gestion des comptes), même s'ils n'ont pas accès à la veille
# réglementaire elle-même.
_ADMIN_ROLE = "admin"


async def _admin_user_ids() -> list[str]:
    """Keycloak user ids of every user holding the ``admin`` realm role --
    même appel que ``admin_users._role_by_user`` (une requête sur
    ``/roles/{name}/users``), pour ce seul rôle. Retombe sur une liste vide
    si Keycloak est injoignable -- ne doit jamais faire échouer la
    publication elle-même (voir ``notify_admins_of_publication``)."""
    try:
        members = await kc_get(f"/roles/{_ADMIN_ROLE}/users", {"max": 1000})
    except Exception:
        return []
    return [m["id"] for m in members if m.get("id")]


async def notify_users(
    db: AsyncSession,
    user_ids: list[str],
    *,
    type: str,
    title: str,
    message: str,
    circular_id: int | None = None,
) -> int:
    """Crée une notification identique pour chaque ``user_id`` -- ne
    committe PAS elle-même (l'appelant décide, généralement dans la même
    transaction que l'action qui déclenche la notification). Retourne le
    nombre de lignes créées."""
    for user_id in user_ids:
        db.add(Notification(
            user_id=user_id, type=type, title=title, message=message,
            circular_id=circular_id,
        ))
    return len(user_ids)


async def notify_admins_of_publication(db: AsyncSession, circular: RegulatoryCircular) -> int:
    """Notifie chaque utilisateur ``admin`` qu'une nouvelle version du
    référentiel vient d'être publiée (voir
    ``app.routers.regulatory.publish_circular``).

    Best-effort : si Keycloak est injoignable (aucun destinataire
    résolu), n'écrit rien et ne lève jamais -- une notification manquée
    ne doit jamais faire échouer la publication elle-même, qui a déjà eu
    lieu au moment où cette fonction est appelée."""
    user_ids = await _admin_user_ids()
    if not user_ids:
        return 0
    return await notify_users(
        db, user_ids,
        type="success",
        title="Nouvelle version du référentiel publiée",
        message=(
            f"La circulaire « {circular.reference} » a été intégrée au "
            f"référentiel ({circular.version}). Les utilisateurs concernés "
            "seront invités à se réévaluer."
        ),
        circular_id=circular.id,
    )
