"""Fixtures partagees pour les tests d'integration API.

Base de test dediee (``datapilot_test``, meme serveur Postgres que le dev,
voir db/init/02-create-test-db.sql) : le schema est recree une fois par
session de test (``_setup_test_schema``), puis chaque test tourne dans sa
propre transaction (SAVEPOINT via ``join_transaction_mode="create_savepoint"``)
annulee a la fin -- aucun test ne pollue le suivant, et la vraie base
``datapilot`` n'est jamais touchee.

L'authentification Keycloak est stubee : ``verify_token`` (la seule
verification qui parle reellement au reseau -- JWKS) est remplacee par des
claims fixes via ``app.dependency_overrides``. Ces tests exercent donc la
VRAIE logique de role (``require_super_admin``/``require_back_office``,
qui restent les fonctions reelles, seulement branchees sur des claims
stubees) et la vraie base de donnees -- seule la verification cryptographique
du JWT lui-meme est court-circuitee.
"""

from __future__ import annotations

import asyncio
import os
from typing import Any, AsyncIterator

import pytest
from dotenv import load_dotenv
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

load_dotenv()

import app.models  # noqa: F401 -- l'import seul enregistre toutes les tables sur Base.metadata
from app.core.auth import verify_token
from app.db.database import Base, get_db
from app.main import app


def _test_database_url() -> str:
    base_url = os.getenv("DATABASE_URL", "")
    if not base_url:
        raise RuntimeError(
            "DATABASE_URL n'est pas definie (backend/.env) -- necessaire "
            "pour deriver l'URL de la base de test."
        )
    root, _, _dbname = base_url.rpartition("/")
    return f"{root}/datapilot_test"


TEST_DATABASE_URL = _test_database_url()


def _make_test_engine():
    """A fresh engine, never reused across event loops.

    asyncpg connections are bound to the event loop that opened them --
    the anyio pytest plugin gives each test its own loop, so a single
    module-level engine shared across the schema-setup fixture (run via
    its own throwaway ``asyncio.run()`` loop) and the per-test fixtures
    (run in the plugin's loop) produced exactly the failure this avoids:
    "Event loop is closed" / "another operation is in progress" from
    asyncpg trying to reuse a connection on a loop that isn't its own.
    Every engine here is created, used, and disposed within the single
    async context that owns it -- never handed to a different one.
    """
    return create_async_engine(TEST_DATABASE_URL, echo=False)

# Claims Keycloak par defaut pour un appel de test : super_admin, acces
# complet. Un test qui veut verifier le garde-fou de role ecrase ce fixture
# via `app.dependency_overrides[verify_token] = lambda: {...}` directement.
SUPER_ADMIN_CLAIMS: dict[str, Any] = {
    "sub": "test-super-admin",
    "email": "super.admin@test.local",
    "name": "Super Admin (test)",
    "realm_access": {"roles": ["super_admin"]},
}


@pytest.fixture(scope="session", autouse=True)
def _setup_test_schema() -> None:
    """Recree un schema propre une fois par session de test.

    Fixture synchrone (pas de dependance a un plugin async pour la
    portee "session") -- pilote sa propre boucle asyncio le temps de
    preparer/nettoyer le schema, independamment du plugin qui gere les
    tests async eux-memes (voir `anyio_backend` ci-dessous).
    """

    async def _reset_schema() -> None:
        engine = _make_test_engine()
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
                await conn.run_sync(Base.metadata.create_all)
        finally:
            await engine.dispose()

    asyncio.run(_reset_schema())
    yield


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    """Une session liee a une connexion + SAVEPOINT dedies a ce seul test.

    Un endpoint appelle `db.commit()` normalement -- ca cloturerait la
    transaction externe si la session etait liee directement au moteur.
    `join_transaction_mode="create_savepoint"` fait que chaque `commit()`
    du code testé ferme seulement le SAVEPOINT courant et en rouvre un
    nouveau ; le rollback final (sur la connexion, pas la session) defait
    tout d'un coup, quel que soit le nombre de commits intermediaires.
    """
    engine = _make_test_engine()
    try:
        async with engine.connect() as connection:
            await connection.begin()
            session = AsyncSession(
                bind=connection,
                join_transaction_mode="create_savepoint",
                expire_on_commit=False,
            )
            try:
                yield session
            finally:
                await session.close()
                await connection.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Client HTTP asynchrone sur la vraie app FastAPI (ASGI in-process --
    aucun serveur reseau demarre), branche sur la session de test isolee
    et authentifie comme super_admin par defaut."""

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[verify_token] = lambda: SUPER_ADMIN_CLAIMS

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
