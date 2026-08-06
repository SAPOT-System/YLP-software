#!/bin/sh
set -eu

# Generates a dev cert/key into the shared certs volume, once. Skips
# regeneration if a cert already exists so restarts are idempotent.
#
# If a dev CA (CA_DIR/server_ca.pem + server_ca.key) is mounted in, issues
# a CA-signed leaf instead of self-signing — required for a mobile build
# that pins the CA (see ../docs/deployment/runbooks.md, Offline CA
# Setup) to trust this server. Otherwise falls back to a plain self-signed
# cert, same as before. See ../server/dev-ca/README.md for the dev-CA workflow;
# this is dev-only — never reuse a CA generated this way for production
# (docs/deployment/runbooks.md's Offline CA Setup covers that separately).

CERT_DIR="${CERT_DIR:-/certs}"
CERT_CN="${CERT_CN:-localhost}"
CERT_SAN="${CERT_SAN:-DNS:localhost,IP:127.0.0.1}"
CERT_DAYS="${CERT_DAYS:-3650}"
CA_DIR="${CA_DIR:-/dev-ca}"
CA_CERT="$CA_DIR/server_ca.pem"
CA_KEY="$CA_DIR/server_ca.key"
LEAF_DAYS="${LEAF_DAYS:-825}"

mkdir -p "$CERT_DIR"

if [ -f "$CERT_DIR/server.crt" ] && [ -f "$CERT_DIR/server.key" ]; then
    CRT_PUBKEY="$(openssl x509 -in "$CERT_DIR/server.crt" -noout -pubkey)"
    KEY_PUBKEY="$(openssl pkey -in "$CERT_DIR/server.key" -pubout)"
    if [ "$CRT_PUBKEY" != "$KEY_PUBKEY" ]; then
        echo "gen-certs: ERROR: $CERT_DIR/server.crt and $CERT_DIR/server.key do not match (public key mismatch) — refusing to continue" >&2
        exit 1
    fi
    echo "gen-certs: $CERT_DIR/server.crt already exists, skipping generation"
elif [ -f "$CA_CERT" ] && [ -f "$CA_KEY" ]; then
    echo "gen-certs: dev CA found at $CA_DIR, issuing CA-signed leaf for CN=$CERT_CN SAN=$CERT_SAN"
    openssl req -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.csr" \
        -subj "/CN=$CERT_CN"

    EXTFILE="$(mktemp)"
    printf 'subjectAltName=%s\n' "$CERT_SAN" > "$EXTFILE"
    openssl x509 -req -in "$CERT_DIR/server.csr" \
        -CA "$CA_CERT" -CAkey "$CA_KEY" \
        -CAcreateserial -CAserial "$CERT_DIR/server_ca.srl" \
        -days "$LEAF_DAYS" \
        -extfile "$EXTFILE" \
        -out "$CERT_DIR/server.crt"
    rm -f "$EXTFILE" "$CERT_DIR/server.csr"
elif [ -f "$CERT_DIR/server.csr" ] && [ ! -f "$CERT_DIR/server.crt" ]; then
    echo "gen-certs: ERROR: CSR pending signature at $CERT_DIR/server.csr — refusing to fall back to self-signed while a CA request is outstanding; sign it via scripts/ca/sign-leaf.sh or remove $CERT_DIR/server.csr explicitly" >&2
    exit 1
else
    echo "gen-certs: no dev CA at $CA_DIR, generating self-signed cert for CN=$CERT_CN SAN=$CERT_SAN"
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERT_DIR/server.key" \
        -out "$CERT_DIR/server.crt" \
        -days "$CERT_DAYS" \
        -subj "/CN=$CERT_CN" \
        -addext "subjectAltName=$CERT_SAN"
fi

chmod 644 "$CERT_DIR/server.crt"
chmod 600 "$CERT_DIR/server.key"
echo "gen-certs: done"
