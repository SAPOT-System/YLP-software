#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true)
[ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }
manifest="$current/manifest.json"; check_schema "$manifest"
echo "SAPOT bundle v$(manifest_value "$manifest" version) ($(manifest_value "$manifest" bundleId))"
echo "Git: $(manifest_value "$manifest" gitSha)  Built: $(manifest_value "$manifest" builtAt)"
echo "Disk: $(df -h "$SAPOT_ROOT" | awk 'NR==2 {print $4 " free of " $2}')"
hardware=$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent)
for service in db redis api admin gsm-fastapi tileserver nginx; do
  state=$(compose "$current" ps --format json "$service" 2>/dev/null | python3 -c 'import json,sys; x=json.load(sys.stdin); x=x[0] if isinstance(x,list) else x; print(x.get("Health") or x.get("State", "missing"))' 2>/dev/null || echo missing)
  [ "$service" = nginx ] && state=${state:+up}
  [ "$service" = gsm-fastapi ] && [ "$hardware" = false ] && [ "$state" = unhealthy ] && state='up (no modem attached)'
  printf '%-14s %s\n' "$service" "$state"
done
