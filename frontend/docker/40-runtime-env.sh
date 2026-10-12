#!/bin/sh
# Writes /env.js from the container's VITE_* variables so the same image runs
# on any host (read by src/lib/env.ts). The nginx image runs every script in
# /docker-entrypoint.d/ before starting nginx. Unset variables are left out,
# so the values baked in at build time (if any) still apply.
set -eu

out=/usr/share/nginx/html/env.js

{
    printf 'window.__ENV__ = {\n'
    for name in VITE_API_URL VITE_KEYCLOAK_URL VITE_KEYCLOAK_REALM VITE_KEYCLOAK_CLIENT_ID; do
        eval "value=\${$name:-}"
        if [ -n "$value" ]; then
            printf '  %s: "%s",\n' "$name" "$value"
        fi
    done
    printf '};\n'
} > "$out"

echo "runtime-env: wrote $out"
