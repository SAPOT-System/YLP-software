#!/usr/bin/env bash
# Issues this server's TLS leaf certificate from the offline CA on a USB stick
# plugged into this host. Generates the key and CSR, signs, verifies, and
# installs the leaf in one run - there is no CSR to carry anywhere.
#
# Plug the CA USB stick in before running, and unplug it afterwards.
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"

usage() { echo "usage: $0 [--ca-dir <mount>] [--rotate-key] [--days <n>]" >&2; exit 2; }

rotate_key=false; ca_dir=
while [ $# -gt 0 ]; do case "$1" in
  --ca-dir) ca_dir=${2:?}; shift 2;;
  --days) SAPOT_CA_LEAF_DAYS=${2:?}; shift 2;;
  --rotate-key) rotate_key=true; shift;;
  --force)
    # Accepted and ignored: --force used to confirm reusing an existing key for a
    # CSR that would sit on disk awaiting an offline signing laptop. Issuance is
    # now atomic and leaves the previous leaf in place unless the new one
    # verifies, so there is nothing left to confirm.
    log_warn "--force is no longer needed - issuance is atomic and non-destructive; ignoring"; shift;;
  *) usage;;
esac; done

acquire_lock
certs_dir="$SAPOT_ROOT/shared/certs"
mkdir -p "$certs_dir"

ip=$("$SELF/../certs/detect-ip.sh" 2>/dev/null || true)
[ -n "$ip" ] || { read -r -p "LAN IP for TLS certificate: " ip; }

[ -n "$ca_dir" ] || ca_dir=$(ca_find_dir)
ca_verify_dir "$ca_dir"
ca_issue_leaf "$certs_dir" "$ip" "$ca_dir" "$rotate_key"

log_info "unplug the CA USB stick now - the CA private key should not stay attached to this host"
if [ -e "$SAPOT_ROOT/releases/current" ]; then
  log_info "then recreate nginx to serve the new leaf:"
  log_info "  sudo docker compose -p sapot -f $SAPOT_ROOT/releases/current/compose/docker-compose.yml up -d --force-recreate nginx"
else
  log_info "then run: sudo ./scripts/install.sh"
fi
