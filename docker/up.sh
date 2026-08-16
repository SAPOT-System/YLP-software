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
# ${MYSQL_*} substitutions are read from this file. When the optional GSM
# hardware overlay is selected, its SERIAL_PORT substitution is read from the
# gateway's .env too, so the device mapping matches the serial worker. Passing --env-file at
# all disables Compose's default auto-load of a root-level .env, so we
# also pass repo-root .env (port overrides, see .env.example) when present
# — --env-file can be repeated, later ones win on overlapping keys, and
# there's no overlap between the two files' variables anyway.
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

ENV_FILE_ARGS="--env-file server/.env"
if [ -f .env ]; then
    ENV_FILE_ARGS="--env-file .env $ENV_FILE_ARGS"
fi

case " $* " in
    *" docker-compose.gsm-hardware.yml "*)
        if [ ! -f GSM-module/GSM-fastapi/.env ]; then
            echo "docker/up.sh: GSM-module/GSM-fastapi/.env is required for the hardware overlay" >&2
            exit 1
        fi
        serial_port="$(sed -n 's/^[[:space:]]*SERIAL_PORT[[:space:]]*=[[:space:]]*//p' GSM-module/GSM-fastapi/.env | tail -n 1)"
        serial_port="${serial_port#\"}"
        serial_port="${serial_port#\'}"
        case "$serial_port" in
            /dev/pts/*)
                echo "docker/up.sh: SERIAL_PORT=$serial_port is a host PTY and cannot be passed through with the hardware overlay" >&2
                echo "docker/up.sh: use docker-compose.gsm-emulator.yml for PTY testing, or set SERIAL_PORT to a host /dev/ttyACM* or /dev/ttyUSB* device" >&2
                exit 1
                ;;
        esac
        ENV_FILE_ARGS="$ENV_FILE_ARGS --env-file GSM-module/GSM-fastapi/.env"
        ;;
esac

exec docker compose $ENV_FILE_ARGS "$@"
