#!/bin/sh
# Brings the database up to date before the API starts: creates the database
# if missing, applies Alembic migrations, seeds reference data into empty
# tables (app/db/init_db.py, idempotent, never touches submissions).
# Set RUN_DB_INIT=false to skip it, e.g. for one-off `docker compose run`s.
set -e

if [ "${RUN_DB_INIT:-true}" = "true" ]; then
    python -m app.db.init_db
fi

exec "$@"
