-- Runs once, on first boot of an empty datapilot-postgres volume.
-- POSTGRES_DB already creates "datapilot"; this adds Keycloak's database.
CREATE DATABASE keycloak;
