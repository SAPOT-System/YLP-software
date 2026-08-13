#!/usr/bin/env bash
# Use a maintenance window: this is data-safe to rerun, but not zero-downtime.
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
source_release=$(cd "$SELF/.." && pwd); source_manifest="$source_release/manifest.json"; check_schema "$source_manifest"; acquire_lock
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true); [ -n "$current" ] || { log_error "not installed - use install.sh first"; exit 1; }
check_schema "$current/manifest.json"
verify_checksums "$source_release" || { log_error "bundle checksum verification failed"; exit 1; }
current_version=$(manifest_value "$current/manifest.json" version); minimum=$(manifest_value "$source_manifest" minimumUpgradeVersion)
[ "$(python3 "$SEMVER" compare "$current_version" "$minimum")" -ge 0 ] || { log_error "current v$current_version is older than minimum upgrade version v$minimum"; exit 1; }
version=$(manifest_value "$source_manifest" version)
[ "$(python3 "$SEMVER" compare "$version" "$current_version")" -gt 0 ] || { log_error "upgrade target v$version must be newer than current v$current_version"; exit 1; }
target="$SAPOT_ROOT/releases/v$version"
disk_preflight "$source_release" "$target" "$(manifest_value "$source_manifest" requiredDiskBytes)"
mkdir -p "$SAPOT_ROOT/releases"; [ -e "$target" ] || cp -a "$source_release" "$target"
for image in "$target"/images/*.tar; do load_image_archive "$image"; done; "$VERIFY_DIGESTS" "$target/manifest.json"
compose "$target" up -d db redis; wait_healthy "$target" db; wait_healthy "$target" redis
live=$(compose "$current" run --rm api alembic current 2>/dev/null | awk '/^[0-9a-f]+/ {print $1; exit}')
head=$(compose "$current" run --rm api alembic heads 2>/dev/null | awk '/^[0-9a-f]+/ {print $1; exit}')
[ -n "$live" ] && [ "$live" = "$head" ] || { log_error "database revision drift: current=$live head=$head"; exit 1; }
compose "$target" run --rm api alembic upgrade head
compose "$target" up -d; for _ in {1..36}; do curl -kfs https://localhost/version >/dev/null 2>&1 && break; sleep 5; done
curl -kfsS https://localhost/version >/dev/null || { log_error "nginx/api did not become ready"; exit 1; }
hardware=$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent); ln -sfn "$target" "$SAPOT_ROOT/releases/current"; write_state upgrade "$current_version" "$version" "$hardware"
# Refresh the unit files only. An operator who deliberately disabled a timer
# should not have an upgrade switch it back on, so nothing is enabled here.
install_systemd_units "$target"
"$SELF/lib/retention.sh"; log_pass "upgraded SAPOT from v$current_version to v$version"
