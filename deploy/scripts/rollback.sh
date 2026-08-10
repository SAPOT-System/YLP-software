#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
target_version=${1:?usage: rollback.sh <target-version>}; acquire_lock
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true); [ -n "$current" ] || { log_error "not installed"; exit 1; }
check_schema "$current/manifest.json"
current_version=$(manifest_value "$current/manifest.json" version); minimum=$(manifest_value "$current/manifest.json" maximumRollbackVersion)
[ "$(python3 "$SEMVER" compare "$target_version" "$minimum")" -ge 0 ] || { log_error "rollback target v$target_version is older than allowed v$minimum"; exit 1; }
target="$SAPOT_ROOT/releases/v$target_version"
if [ ! -d "$target" ]; then
  last=$(find "$SAPOT_ROOT/releases" -maxdepth 1 -type d -name 'v*' -printf '%f\n' | sort -V | tail -1)
  log_error "rollback target v$target_version is no longer retained locally - last available: ${last:-none}"; exit 1
fi
check_schema "$target/manifest.json"
live=$(compose "$current" run --rm api alembic current 2>/dev/null | awk '/^[0-9a-f]+/ {print $1; exit}')
target_head=$(compose "$target" run --rm api alembic heads 2>/dev/null | awk '/^[0-9a-f]+/ {print $1; exit}')
[ -n "$live" ] && [ -n "$target_head" ] || { log_error "could not determine database revisions"; exit 1; }
current_tag=$(manifest_value "$current/manifest.json" images.api.tag)
docker run --rm -v "$SELF/lib/alembic_ancestor_check.py:/check.py:ro" "$current_tag" python /check.py --versions-dir /home/app/server/app/alembic/versions --live-revision "$live" --target-head "$target_head" || { log_error "database revision is not compatible with rollback"; exit 1; }
ln -sfn "$target" "$SAPOT_ROOT/releases/current"; compose "$target" up -d
# Restore the rolled-back release's units so they match the code now running.
# Like upgrade, this refreshes without enabling anything.
install_systemd_units "$target"
hardware=$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent); write_state rollback "$current_version" "$target_version" "$hardware"
log_pass "rolled back from v$current_version to v$target_version"
