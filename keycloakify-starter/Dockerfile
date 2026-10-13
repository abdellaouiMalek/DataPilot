# Keycloak with the DataPilot (EY) login theme baked in. Built and pushed to
# GHCR by .github/workflows/docker-publish.yml. Locally, docker-compose.yml at
# the repo root mounts the jar instead.

# 1) Build the Keycloakify theme jar (Node + JDK + Maven).
FROM node:22-bookworm-slim AS theme
RUN mkdir -p /usr/share/man/man1 \
    && apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jdk-headless maven \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /theme
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build-keycloak-theme

# 2) Pre-build Keycloak for Postgres with the theme as a provider, so the
#    container can `start --optimized` without a build step on every boot.
FROM quay.io/keycloak/keycloak:26.8 AS builder
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true
COPY --from=theme /theme/dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/datapilot-theme.jar
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
