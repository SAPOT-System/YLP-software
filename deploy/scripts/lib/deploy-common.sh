#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/log.sh"
source "$SCRIPT_DIR/lock.sh"
SEMVER="$SCRIPT_DIR/semver.py"
VERIFY_DIGESTS="$SCRIPT_DIR/verify-digests.sh"
SAPOT_ROOT=${SAPOT_ROOT:-/opt/sapot}
SAFETY_PERCENT=${SAPOT_DISK_SAFETY_PERCENT:-20}

manifest_value() { python3 - "$1" "$2" <<'PY'
import json, sys
value=json.load(open(sys.argv[1], encoding="utf-8"))
for key in sys.argv[2].split('.'):
    value=value[key]
print(value if not isinstance(value, (dict,list)) else json.dumps(value))
PY
}
check_schema() {
  local manifest=$1 actual
  actual=$(manifest_value "$manifest" schemaVersion)
  [ "$actual" = "1.0" ] || { log_error "Unsupported manifest schema version: got $actual, expected 1.0"; return 1; }
}
compose() {
  local release=$1; shift
  local args=(-p sapot -f "$release/compose/docker-compose.yml")
  if [ -f "$SAPOT_ROOT/shared/state.json" ] && [ "$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent 2>/dev/null || echo false)" = true ]; then
    args+=(-f "$release/compose/docker-compose.gsm-hardware.yml")
  fi
  docker compose "${args[@]}" "$@"
}
verify_checksums() { (cd "$1" && sha256sum -c CHECKSUMS.sha256); }
disk_preflight() {
  local required=$1 margin docker_root free
  margin=$((required * (100 + SAFETY_PERCENT) / 100))
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  for path in "$SAPOT_ROOT" "$docker_root"; do
    free=$(df -PB1 "$path" | awk 'NR==2 {print $4}')
    if [ "$free" -lt "$margin" ]; then log_error "insufficient free space on $path: need $margin bytes, have $free"; return 1; fi
  done
}
wait_healthy() {
  local release=$1 service=$2 attempts=${3:-36} status
  while [ "$attempts" -gt 0 ]; do
    status=$(compose "$release" ps --format json "$service" 2>/dev/null | python3 -c 'import json,sys; x=json.load(sys.stdin); x=x[0] if isinstance(x,list) else x; print(x.get("Health", ""))' 2>/dev/null || true)
    [ "$status" = healthy ] && return 0
    sleep 5; attempts=$((attempts - 1))
  done
  log_error "$service did not become healthy"
  return 1
}
write_state() {
  local operation=$1 from=$2 to=$3 hardware=$4
  python3 - "$SAPOT_ROOT/shared/state.json" "$operation" "$from" "$to" "$hardware" <<'PY'
import json, os, sys
path, typ, old, new, hardware = sys.argv[1:]
state = json.load(open(path)) if os.path.exists(path) else {}
state.update({"currentVersion": new, "previousVersion": old or None, "gsmHardwarePresent": hardware == "true"})
if typ == "install": state["installedAt"] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
else: state["lastUpgradeAt"] = __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()
history=state.setdefault("history", []); history.append({"type":typ,"from":old or None,"to":new,"at":__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat()}); state["history"]=history[-50:]
tmp=path+".tmp"
with open(tmp,"w",encoding="utf-8") as f: json.dump(state,f,indent=2); f.write("\n")
os.replace(tmp,path)
PY
}
prepare_env_files() {
  local release=$1 generated secret mysql_password
  mkdir -p "$SAPOT_ROOT/shared" "$SAPOT_ROOT/shared/certs" "$SAPOT_ROOT/shared/db-data" "$SAPOT_ROOT/shared/gsm-arduino-backups"
  secret=$(openssl rand -hex 32); mysql_password=$(openssl rand -hex 32)
  for name in server admin gsm-fastapi gsm-arduino; do
    generated="$SAPOT_ROOT/shared/$name.env"
    [ -e "$generated" ] && continue
    sed -e "s/__GENERATE__/$secret/g" -e "s/__FROM_SERVER_GSM_SECRET__/$secret/g" -e "s/__FROM_SERVER_MYSQL_PASSWORD__/$mysql_password/g" -e "s/mysql+pymysql:\/\/sapot:$secret@db/mysql+pymysql:\/\/sapot:$mysql_password@db/" "$release/config/$name.env.example" > "$generated"
    [ "$name" = server ] && sed -i "s|mysql+pymysql://sapot:$secret@db|mysql+pymysql://sapot:$mysql_password@db|" "$generated"
    chmod 600 "$generated"
  done
}
