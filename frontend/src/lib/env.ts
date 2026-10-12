/**
 * Runtime configuration.
 *
 * The Docker image is built once and runs on whatever host it's deployed to,
 * so the URLs it talks to can't be baked in at build time: the container
 * writes `/env.js` on startup (docker/40-runtime-env.sh), which sets
 * `window.__ENV__` before the bundle runs. Under `npm run dev`, public/env.js
 * is an empty stub, so Vite's import.meta.env (frontend/.env) applies.
 */

type RuntimeEnv = Partial<
  Record<
    | "VITE_API_URL"
    | "VITE_KEYCLOAK_URL"
    | "VITE_KEYCLOAK_REALM"
    | "VITE_KEYCLOAK_CLIENT_ID",
    string
  >
>;

declare global {
  interface Window {
    __ENV__?: RuntimeEnv;
  }
}

const runtime: RuntimeEnv =
  (typeof window !== "undefined" && window.__ENV__) || {};

export const API_URL =
  runtime.VITE_API_URL ?? import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export const KEYCLOAK_URL =
  runtime.VITE_KEYCLOAK_URL ?? import.meta.env.VITE_KEYCLOAK_URL;

export const KEYCLOAK_REALM =
  runtime.VITE_KEYCLOAK_REALM ?? import.meta.env.VITE_KEYCLOAK_REALM;

export const KEYCLOAK_CLIENT_ID =
  runtime.VITE_KEYCLOAK_CLIENT_ID ?? import.meta.env.VITE_KEYCLOAK_CLIENT_ID;
