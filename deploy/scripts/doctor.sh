#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
# shellcheck source=./lib/backup-lib.sh
source "$SELF/lib/backup-lib.sh"
json=false; [ "${1:-}" = --json ] && json=true
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true); [ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }
check_schema "$current/manifest.json"
checks=(); failed=0
check() { local name=$1 status=$2 detail=$3; checks+=("$name|$status|$detail"); [ "$status" = PASS ] || failed=1; }
verify_checksums "$current" >/dev/null 2>&1 && check checksums PASS "release files match CHECKSUMS.sha256" || check checksums FAIL "release checksum mismatch"
"$VERIFY_DIGESTS" "$current/manifest.json" >/dev/null 2>&1 && check images PASS "loaded image digests match manifest" || check images FAIL "missing or mismatched image digest"
free=$(df -h "$SAPOT_ROOT" | awk 'NR==2 {print $4}'); check disk PASS "$free free on $SAPOT_ROOT"
hardware=$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent)
for service in db redis api admin gsm-fastapi tileserver nginx; do
  state=$(compose "$current" ps --format json "$service" 2>/dev/null | python3 -c 'import json,sys; x=json.load(sys.stdin); x=x[0] if isinstance(x,list) else x; print(x.get("Health") or x.get("State", "missing"))' 2>/dev/null || echo missing)
  if [ "$service" = nginx ]; then [ "$state" = running ] && check "$service" PASS up || check "$service" FAIL "$state"
  elif [ "$service" = gsm-fastapi ] && [ "$hardware" = false ] && [ "$state" = unhealthy ]; then check "$service" PASS "no modem attached, degraded health expected"
  elif [ "$state" = healthy ]; then check "$service" PASS healthy
  else check "$service" FAIL "$state"; fi
done
backup_fields=()
mapfile -t -d '' backup_fields < <(resolve_backup_paths)
backup_dir=${backup_fields[2]}
max_age_hours=${SAPOT_BACKUP_MAX_AGE_HOURS:-36}
offhost_dir=${SAPOT_BACKUP_OFFHOST_DIR:-}
newest_epoch=$(newest_backup_epoch "$backup_dir")
if [ -n "$offhost_dir" ] && [ -d "$offhost_dir" ]; then
  offhost_epoch=$(newest_backup_epoch "$offhost_dir")
  if [ -n "$offhost_epoch" ]; then offhost_detail="off-host $(( ($(date +%s) - offhost_epoch) / 3600 ))h ago"; else offhost_detail='off-host has no dumps'; fi
elif [ -n "$offhost_dir" ]; then offhost_detail='off-host target unavailable'
else offhost_detail='off-host not configured'; fi
if [ -z "$newest_epoch" ]; then
  check db-backup FAIL "no backups in $backup_dir; $offhost_detail"
else
  backup_age_hours=$(( ($(date +%s) - newest_epoch) / 3600 ))
  if [ "$backup_age_hours" -lt "$max_age_hours" ]; then check db-backup PASS "newest ${backup_age_hours}h ago; $offhost_detail"
  else check db-backup FAIL "newest ${backup_age_hours}h ago exceeds ${max_age_hours}h threshold; $offhost_detail"; fi
fi
cert="$SAPOT_ROOT/shared/certs/server.crt"; [ -f "$cert" ] && openssl x509 -checkend 0 -noout -in "$cert" >/dev/null && check certificate PASS "certificate is current" || check certificate FAIL "certificate missing or expired"
for port in 80 443; do ss -ltn "sport = :$port" | grep -q LISTEN && check "port-$port" PASS bound || check "port-$port" FAIL not-bound; done
if [ "$hardware" = true ]; then port=$(grep '^GSM_ARDUINO_PORT=' "$SAPOT_ROOT/shared/gsm-arduino.env" | cut -d= -f2-); [ -c "$port" ] && check gsm-device PASS "$port present" || check gsm-device FAIL "$port missing"; fi
if "$json"; then printf '%s\n' "${checks[@]}" | python3 -c 'import json,sys; print(json.dumps([dict(zip(("check","status","detail"), line.rstrip().split("|",2))) for line in sys.stdin]))'
else for row in "${checks[@]}"; do IFS='|' read -r name state detail <<< "$row"; [ "$state" = PASS ] && log_pass "$name: $detail" || log_fail "$name: $detail"; done; fi
exit "$failed"
