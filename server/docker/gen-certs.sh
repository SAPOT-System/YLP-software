#!/bin/sh
set -eu

# Generates a self-signed dev cert/key into the shared certs volume, once.
# Mirrors the openssl recipe documented in .env.example / nginx.conf, but
# skips regeneration if a cert already exists so restarts are idempotent.

CERT_DIR="${CERT_DIR:-/certs}"
CERT_CN="${CERT_CN:-localhost}"
CERT_SAN="${CERT_SAN:-DNS:localhost,IP:127.0.0.1}"
CERT_DAYS="${CERT_DAYS:-3650}"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    echo "gen-certs: $CERT_DIR/server.crt already exists, skipping generation"
    exit 0
fi

echo "gen-certs: generating self-signed cert for CN=$CERT_CN SAN=$CERT_SAN"
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -days "$CERT_DAYS" \
    -subj "/CN=$CERT_CN" \
    -addext "subjectAltName=$CERT_SAN"

chmod 644 "$CERT_DIR/server.crt"
chmod 600 "$CERT_DIR/server.key"
echo "gen-certs: done"
