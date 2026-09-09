-- Runs once, on first boot of an empty datapilot-postgres volume.
-- Dedicated database for the backend's pytest integration suite
-- (backend/tests/conftest.py) -- kept separate from "datapilot" so tests
-- never touch real dev data, and from "keycloak" since it's plain
-- SQLAlchemy/pgvector, no realm import involved.
CREATE DATABASE datapilot_test;
\connect datapilot_test
CREATE EXTENSION IF NOT EXISTS vector;
