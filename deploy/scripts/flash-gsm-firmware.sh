#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
yes=false; check_only=false; port_override=
while [ $# -gt 0 ]; do case "$1" in --yes) yes=true;; --check) check_only=true;; *) port_override=$1;; esac; shift; done
acquire_lock
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true); [ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }
manifest="$current/manifest.json"; check_schema "$manifest"
source "$SAPOT_ROOT/shared/gsm-arduino.env"; port=${port_override:-$GSM_ARDUINO_PORT}
hex="$current/firmware/gsm-arduino-actual-code.hex"; expected=$(manifest_value "$manifest" gsmFirmware.sha256)
[ "$(sha256sum "$hex" | awk '{print $1}')" = "$expected" ] || { log_error "firmware checksum mismatch"; exit 1; }
[ -c "$port" ] || { log_error "no device at $port - check the cable, or is gsm-fastapi still holding it?"; exit 1; }
[ "$(manifest_value "$manifest" gsmFirmware.fqbn)" = "$GSM_ARDUINO_FQBN" ] || { log_error "firmware board does not match GSM_ARDUINO_FQBN"; exit 1; }
constraint=$(manifest_value "$manifest" gsmFirmware.compatibleGsmFastapiVersion); installed=$(manifest_value "$current/manifest.json" version)
python3 "$SEMVER" satisfies "$installed" "$constraint" || { log_error "gsm-fastapi v$installed does not satisfy $constraint"; exit 1; }
compose "$current" stop gsm-fastapi || true
restart() { compose "$current" up -d gsm-fastapi >/dev/null 2>&1 || true; }
trap restart EXIT
mkdir -p "$SAPOT_ROOT/shared/gsm-arduino-backups"; backup_name="backup-$(date -u +%Y%m%dT%H%M%SZ)-unknown.hex"; backup="$SAPOT_ROOT/shared/gsm-arduino-backups/$backup_name"
flasher=$(manifest_value "$manifest" images.arduino-flasher.tag)
docker run --rm --device="$port:$port" -v "$SAPOT_ROOT/shared/gsm-arduino-backups:/backups" --entrypoint avrdude "$flasher" -p atmega328p -c arduino -P "$port" -b 115200 -U "flash:r:/backups/$backup_name:i" || { log_error "firmware backup read failed; upload was not attempted"; exit 1; }
log_info "backup saved to $backup"
if "$check_only"; then log_pass "firmware flash preflight passed; --check did not upload"; exit 0; fi
if ! "$yes"; then read -r -p "Flash target firmware v$(manifest_value "$manifest" gsmFirmware.version)? [y/N] " answer; [[ "$answer" =~ ^[Yy]$ ]] || { log_warn "flash cancelled"; exit 0; }; fi
docker run --rm --device="$port:$port" -v "$hex:/firmware.hex:ro" "$flasher" upload --fqbn "$GSM_ARDUINO_FQBN" --input-file /firmware.hex --port "$port"
python3 - "$SAPOT_ROOT/shared/state.json" "$(manifest_value "$manifest" gsmFirmware.version)" <<'PY'
import json, os, sys
path, version = sys.argv[1:]
state=json.load(open(path)); state["lastFirmwareFlashed"]={"version":version,"at":__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}
tmp=path+".tmp"; json.dump(state,open(tmp,"w"),indent=2); open(tmp,"a").write("\n"); os.replace(tmp,path)
PY
log_pass "flashed GSM firmware v$(manifest_value "$manifest" gsmFirmware.version)"
