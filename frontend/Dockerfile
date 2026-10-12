# DataPilot SPA (React + Vite), served by nginx. Built and pushed to GHCR by
# .github/workflows/docker-publish.yml.
# API/Keycloak URLs are runtime env vars (VITE_*), not build args: see
# src/lib/env.ts.

FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/40-runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh
COPY --from=build /app/dist /usr/share/nginx/html
