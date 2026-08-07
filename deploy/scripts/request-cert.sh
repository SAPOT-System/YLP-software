#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"

force=false; rotate_key=false
while [ $# -gt 0 ]; do case "$1" in
  --force) force=true;;
  --rotate-key) rotate_key=true;;
  *) log_error "usage: $0 [--force] [--rotate-key]"; exit 2;;
esac; shift; done
"$rotate_key" && ! "$force" && { log_error "--rotate-key must be combined with --force"; exit 2; }

acquire_lock
mkdir -p "$SAPOT_ROOT/shared/certs"
certs_dir="$SAPOT_ROOT/shared/certs"
key="$certs_dir/server.key"; csr="$certs_dir/server.csr"; crt="$certs_dir/server.crt"

ip=$("$SELF/../certs/detect-ip.sh" 2>/dev/null || true)
[ -n "$ip" ] || { read -r -p "LAN IP for TLS certificate: " ip; }

key_exists=false; [ -e "$key" ] && key_exists=true
csr_exists=false; [ -e "$csr" ] && csr_exists=true

if ! "$rotate_key"; then
  if "$key_exists" && ! "$csr_exists"; then
    crt_exists=false; [ -e "$crt" ] && crt_exists=true
    if ! "$crt_exists"; then
      log_error "server.key exists but no server.csr or server.crt - either a key is already in use for this server, or a previous run was interrupted before writing the CSR. If no leaf was ever issued from this key, --force --rotate-key is safe despite its warning."
      exit 1
    fi
    # server.crt exists alongside server.key (typical right after install.sh's
    # self-signed gen-certs.sh run) - this is legitimate key reuse, not an
    # interrupted run, as long as the crt/key are actually a matching pair.
    # Verify the same way docker/gen-certs.sh and doctor.sh do.
    crt_pubkey=$(openssl x509 -in "$crt" -noout -pubkey 2>/dev/null || true)
    key_pubkey=$(openssl pkey -in "$key" -pubout 2>/dev/null || true)
    if [ -z "$crt_pubkey" ] || [ "$crt_pubkey" != "$key_pubkey" ]; then
      log_error "server.key exists but no server.csr, and the existing server.crt does not match server.key - inconsistent certs directory; refusing. --force --rotate-key will regenerate both."
      exit 1
    fi
    if ! "$force"; then
      log_error "server.key and a matching server.crt already exist (no server.csr) - use --force to reuse this key and issue a fresh server.csr, or --force --rotate-key to also rotate the key"
      exit 1
    fi
    # falls through: --force given, matching pair confirmed - the generation
    # step below reuses the existing key and regenerates server.csr from it.
  fi
  if ! "$key_exists" && "$csr_exists"; then
    log_error "server.csr exists but no server.key - inconsistent certs directory; refusing. --force --rotate-key will regenerate both."
    exit 1
  fi
  if "$key_exists" && "$csr_exists" && ! "$force"; then
    log_error "server.key and server.csr already exist - use --force to regenerate server.csr, or --force --rotate-key to also rotate the key"
    exit 1
  fi
fi

if "$rotate_key"; then
  if [ -e "$crt" ]; then
    stale="$crt.stale-$(date -u +%Y%m%dT%H%M%SZ)"
    mv "$crt" "$stale"
    log_warn "moved existing server.crt to $(basename "$stale") - preserved for audit"
  fi
  log_warn "rotating server.key - every leaf previously issued for this server is now invalidated"
  log_warn "server.crt will be ABSENT from $certs_dir until the new signed leaf is copied back - do NOT restart/recreate the nginx container or reboot this host until then, or TLS will break with no automatic recovery"
  openssl req -newkey rsa:2048 -nodes -keyout "$key" -out "$csr" -subj "/CN=$ip" -addext "subjectAltName=DNS:$SAPOT_SERVER_DNS_NAME,IP:$ip,DNS:localhost"
elif "$key_exists"; then
  log_info "reusing existing server.key, regenerating server.csr for CN=$ip"
  openssl req -new -key "$key" -out "$csr" -subj "/CN=$ip" -addext "subjectAltName=DNS:$SAPOT_SERVER_DNS_NAME,IP:$ip,DNS:localhost"
else
  openssl req -newkey rsa:2048 -nodes -keyout "$key" -out "$csr" -subj "/CN=$ip" -addext "subjectAltName=DNS:$SAPOT_SERVER_DNS_NAME,IP:$ip,DNS:localhost"
fi
chmod 600 "$key"

log_pass "generated $csr for CN=$ip"
log_info "server.csr sha256: $(sha256sum "$csr" | cut -d' ' -f1)"
log_info "next steps:"
log_info "1. copy server.csr to the CA laptop via USB - note the sha256 above (or photograph it) and compare it against what sign-leaf.sh prints before confirming the signature, to detect tampering in transit"
log_info "2. sign it with scripts/ca/sign-leaf.sh (see docs)"
if [ -e "$SAPOT_ROOT/releases/current" ]; then
  log_info "3. place server.crt in $SAPOT_ROOT/shared/certs, then recreate nginx:"
  log_info "   sudo docker compose -p sapot -f $SAPOT_ROOT/releases/current/compose/docker-compose.yml up -d --force-recreate nginx"
else
  log_info "3. place server.crt in $SAPOT_ROOT/shared/certs, then run: sudo ./scripts/install.sh"
fi
