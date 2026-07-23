#!/bin/sh
set -eu

# Wrapper around `docker compose` that auto-detects this machine's LAN IP
# (via detect-ip.sh) and adds it to CERT_SAN, so the dev cert (gen-certs.sh)
# validates when a client (mobile app, admin frontend) connects via LAN IP
# instead of localhost. gen-certs.sh issues a CA-signed leaf from the
# shared dev CA (../server/dev-ca/) when present, or a plain self-signed cert
# otherwise — either way, this script's job is just getting the right SAN
# to it.
#
# Respects an already-set CERT_SAN (exported in the shell, or passed
# inline: `CERT_SAN=... docker/up.sh up`) rather than overriding it, so
# manual control still works. A CERT_SAN set only in .env is not visible
# here (docker compose reads .env itself) — auto-detection wins in that
# case unless you export CERT_SAN in the shell first.
#
# Passes --env-file server/.env explicitly: docker-compose.yml's
# ${MYSQL_*} substitutions are read from this file. Compose only
# auto-loads a .env next to the compose file (repo root) by default,
# and there isn't one there — server/.env is the single source of
# truth for these values, shared with the api service's own env_file.
#
# Usage: docker/up.sh up --build
#        docker/up.sh run --rm api pytest
#        (any other docker compose subcommand/args)

cd "$(dirname "$0")/.."

if [ -z "${CERT_SAN:-}" ]; then
    HOST_IP="$(sh docker/detect-ip.sh 2>/dev/null || true)"
    CERT_SAN="DNS:localhost,IP:127.0.0.1"
    if [ -n "$HOST_IP" ]; then
        CERT_SAN="$CERT_SAN,IP:$HOST_IP"
        echo "docker/up.sh: detected LAN IP $HOST_IP, added to CERT_SAN" >&2
    else
        echo "docker/up.sh: could not detect LAN IP, CERT_SAN=$CERT_SAN" >&2
    fi
    export CERT_SAN
fi

exec docker compose --env-file server/.env "$@"
