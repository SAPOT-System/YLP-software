#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
source_release=$(cd "$SELF/.." && pwd); source_manifest="$source_release/manifest.json"
check_schema "$source_manifest"; acquire_lock
version=$(manifest_value "$source_manifest" version)
if [ -L "$SAPOT_ROOT/releases/current" ] || [ -e "$SAPOT_ROOT/releases/current" ]; then
  current=$(manifest_value "$(readlink -f "$SAPOT_ROOT/releases/current")/manifest.json" version)
  log_error "already installed (v$current) - use upgrade.sh instead"; exit 1
fi
verify_checksums "$source_release" || { log_error "bundle checksum verification failed"; exit 1; }
disk_preflight "$(manifest_value "$source_manifest" requiredDiskBytes)"
target="$SAPOT_ROOT/releases/v$version"; mkdir -p "$SAPOT_ROOT/releases"
[ ! -e "$target" ] && cp -a "$source_release" "$target"
prepare_env_files "$target"
ip=$($target/certs/detect-ip.sh 2>/dev/null || true)
[ -n "$ip" ] || { read -r -p "LAN IP for TLS certificate: " ip; }
CERT_DIR="$SAPOT_ROOT/shared/certs" CERT_CN="$ip" CERT_SAN="IP:$ip,DNS:localhost" "$target/certs/gen-certs.sh"
read -r -p "Is the GSM Arduino connected at $(grep '^GSM_ARDUINO_PORT=' "$SAPOT_ROOT/shared/gsm-arduino.env" | cut -d= -f2)? [y/N] " answer
hardware=false; [[ "$answer" =~ ^[Yy]$ ]] && hardware=true
for image in "$target"/images/*.tar; do docker load -i "$image"; done
"$VERIFY_DIGESTS" "$target/manifest.json"
compose "$target" up -d db redis; wait_healthy "$target" db; wait_healthy "$target" redis
compose "$target" run --rm api alembic upgrade head
compose "$target" up -d; for _ in {1..36}; do curl -kfs https://localhost/version >/dev/null 2>&1 && break; sleep 5; done
curl -kfsS https://localhost/version >/dev/null || { log_error "nginx/api did not become ready"; exit 1; }
ln -sfn "$target" "$SAPOT_ROOT/releases/current"; write_state install "" "$version" "$hardware"
"$SELF/lib/retention.sh"; log_pass "installed SAPOT v$version"
