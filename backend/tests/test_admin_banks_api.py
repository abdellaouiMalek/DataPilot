"""Tests d'integration pour /api/super-admin/banks (app/routers/admin_banks.py).

Vraie app FastAPI, vraie base de test (voir conftest.py) -- ces tests
verifient le comportement HTTP reel : codes de statut, le conflit 409 sur
nom en doublon (contrainte unique gérée cote DB), le garde-fou de role
require_super_admin, et que les stats (assessments_count) refletent bien
le contenu de la base plutot que d'etre mockees.

    pytest backend/tests/test_admin_banks_api.py
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.auth import verify_token
from app.main import app

pytestmark = pytest.mark.anyio


def _bank_payload(**overrides: object) -> dict:
    payload = {
        "name": "Banque Test",
        "country": "Tunisie",
        "sector": "Banque de detail",
        "contact": "contact@banquetest.tn",
        "description": "Une banque creee pour les tests.",
    }
    payload.update(overrides)
    return payload


async def test_create_bank_success(client: AsyncClient) -> None:
    resp = await client.post("/api/super-admin/banks", json=_bank_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Banque Test"
    assert body["status"] == "Actif"
    assert body["assessments_count"] == 0
    assert body["score"] is None


async def test_create_bank_nom_en_double_409(client: AsyncClient) -> None:
    """Deux banques du meme nom -> 409 avec le message francais reel, pas
    une 500 issue d'une IntegrityError non geree. Les deux requetes
    passent par le meme `client` (donc la meme transaction de test), la
    contrainte unique reelle de la colonne `name` est donc bien exercee."""
    first = await client.post("/api/super-admin/banks", json=_bank_payload())
    assert first.status_code == 201
    second = await client.post("/api/super-admin/banks", json=_bank_payload())
    assert second.status_code == 409
    assert second.json()["detail"] == "Une banque porte déjà ce nom."


async def test_list_banks_apres_creation(client: AsyncClient) -> None:
    await client.post("/api/super-admin/banks", json=_bank_payload(name="Banque A"))
    await client.post("/api/super-admin/banks", json=_bank_payload(name="Banque B"))

    resp = await client.get("/api/super-admin/banks")
    assert resp.status_code == 200
    names = {b["name"] for b in resp.json()}
    assert {"Banque A", "Banque B"}.issubset(names)


async def test_update_bank_persiste_les_nouveaux_champs(client: AsyncClient) -> None:
    created = await client.post("/api/super-admin/banks", json=_bank_payload())
    bank_id = created.json()["id"]

    updated = await client.put(
        f"/api/super-admin/banks/{bank_id}",
        json=_bank_payload(name="Banque Renommee", sector="Banque d'investissement"),
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Banque Renommee"
    assert updated.json()["sector"] == "Banque d'investissement"


async def test_set_bank_active_toggle(client: AsyncClient) -> None:
    created = await client.post("/api/super-admin/banks", json=_bank_payload())
    bank_id = created.json()["id"]

    resp = await client.put(f"/api/super-admin/banks/{bank_id}/active", json={"is_active": False})
    assert resp.status_code == 200
    assert resp.json()["status"] == "Désactivé"


async def test_set_bank_archived_desactive_aussi(client: AsyncClient) -> None:
    """Archiver une banque la desactive egalement (voir set_bank_archived)."""
    created = await client.post("/api/super-admin/banks", json=_bank_payload())
    bank_id = created.json()["id"]

    resp = await client.put(f"/api/super-admin/banks/{bank_id}/archived", json={"archived": True})
    assert resp.status_code == 200
    body = resp.json()
    assert body["archived"] is True
    assert body["is_active"] is False
    assert body["status"] == "Archivé"


async def test_bank_introuvable_404(client: AsyncClient) -> None:
    resp = await client.put(
        "/api/super-admin/banks/999999", json=_bank_payload()
    )
    assert resp.status_code == 404


async def test_nom_manquant_422_validation_pydantic(client: AsyncClient) -> None:
    """Le champ `name` est requis (min_length=1) -- Pydantic doit rejeter
    avant meme d'atteindre la logique de la route."""
    resp = await client.post("/api/super-admin/banks", json=_bank_payload(name=""))
    assert resp.status_code == 422


async def test_role_admin_simple_refuse_403(client: AsyncClient) -> None:
    """require_super_admin est la VRAIE fonction ici -- seules les claims
    sont stubees. Un role "admin" (back-office reduit, pas super_admin)
    doit etre refuse sur un endpoint reserve au super_admin. Pas besoin
    de restaurer le stub par defaut ensuite : le fixture `client` efface
    tous les `dependency_overrides` a la fin de CE test de toute facon."""
    app.dependency_overrides[verify_token] = lambda: {
        "sub": "test-admin",
        "realm_access": {"roles": ["admin"]},
    }
    resp = await client.get("/api/super-admin/banks")
    assert resp.status_code == 403
