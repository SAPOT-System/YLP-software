#!/bin/sh
set -eu

# Wrapper around `docker compose` that auto-detects this machine's LAN IP
# (via detect-ip.sh) and adds it to CERT_SAN, so the self-signed dev cert
# (gen-certs.sh) validates when a client (mobile app, admin frontend)
# connects via LAN IP instead of localhost.
#
# Respects an already-set CERT_SAN (exported in the shell, or passed
# inline: `CERT_SAN=... docker/up.sh up`) rather than overriding it, so
# manual control still works. A CERT_SAN set only in .env is not visible
# here (docker compose reads .env itself) — auto-detection wins in that
# case unless you export CERT_SAN in the shell first.
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

exec docker compose "$@"
