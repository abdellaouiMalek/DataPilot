"""One-command database bootstrap for a freshly cloned project.

Does everything needed to get an empty PostgreSQL server ready for the app:

    1. create the target database (from DATABASE_URL) if it doesn't exist yet
    2. apply all Alembic migrations  (``alembic upgrade head``)
    3. seed the reference data        (``app.db.seed``)

Run once after cloning & configuring ``backend/.env``:

    python -m app.db.init_db                 # idempotent, safe to re-run
    python -m app.db.init_db --reset         # wipe & reseed the reference tables
    python -m app.db.init_db --skip-migrations

Every step is idempotent, so re-running it on an already-configured database is
harmless (it just reports that things are already in place).
"""

import asyncio
import sys
from pathlib import Path

import asyncpg
from alembic import command
from alembic.config import Config
from sqlalchemy.engine import make_url

from app.db.database import DATABASE_URL
from app.db.seed import seed

# backend/, holds alembic.ini and the alembic/ migration tree.
BACKEND_DIR = Path(__file__).resolve().parents[2]


async def ensure_database() -> None:
    """Create the target database if it isn't there yet.

    Connects to the ``postgres`` maintenance database with the same credentials
    and issues ``CREATE DATABASE`` only when missing.
    """
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is missing, set it in backend/.env")

    url = make_url(DATABASE_URL)
    target = url.database
    if not target:
        raise RuntimeError(f"No database name found in DATABASE_URL: {DATABASE_URL!r}")

    try:
        conn = await asyncpg.connect(
            host=url.host or "localhost",
            port=url.port or 5432,
            user=url.username,
            password=url.password,
            database="postgres",  # maintenance db, always present
        )
    except (OSError, asyncpg.PostgresError) as exc:
        raise RuntimeError(
            f"Could not connect to PostgreSQL at "
            f"{url.host or 'localhost'}:{url.port or 5432} as user {url.username!r}. "
            f"Is the server running and are the credentials in backend/.env correct?\n  -> {exc}"
        ) from exc

    try:
        exists = await conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", target
        )
        if exists:
            print(f"- database {target!r} already exists")
        else:
            # CREATE DATABASE cannot run inside a transaction; asyncpg.execute
            # autocommits, so this is fine. Quote the name to be safe.
            await conn.execute(f'CREATE DATABASE "{target}"')
            print(f"- created database {target!r}")
    finally:
        await conn.close()


def run_migrations() -> None:
    """Apply all Alembic migrations up to head (synchronous, psycopg2 driver)."""
    alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    # alembic.ini already resolves script_location relative to itself and
    # env.py pulls the URL from DATABASE_URL, so no extra wiring is needed.
    command.upgrade(alembic_cfg, "head")
    print("- applied migrations (alembic upgrade head)")


async def init_db(reset: bool = False, skip_migrations: bool = False) -> None:
    print("DataPilot, initializing database")

    await ensure_database()

    if skip_migrations:
        print("- skipping migrations (--skip-migrations)")
    else:
        run_migrations()

    await seed(reset=reset)


if __name__ == "__main__":
    asyncio.run(
        init_db(
            reset="--reset" in sys.argv,
            skip_migrations="--skip-migrations" in sys.argv,
        )
    )
