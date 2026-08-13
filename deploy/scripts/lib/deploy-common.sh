#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/log.sh"
source "$SCRIPT_DIR/lock.sh"
source "$SCRIPT_DIR/ca-certs.sh"
SEMVER="$SCRIPT_DIR/semver.py"
VERIFY_DIGESTS="$SCRIPT_DIR/verify-digests.sh"
SAPOT_ROOT=${SAPOT_ROOT:-/opt/sapot}
SAFETY_PERCENT=${SAPOT_DISK_SAFETY_PERCENT:-20}
# Stable DNS name the mobile app's preview/production builds connect to, and the
# only host their CA pin is scoped to (docs/deployment/mobile-eas.md). Every leaf
# issued for this server must carry it as a SAN or those builds fail TLS hostname
# verification, regardless of what the LAN IP is.
SAPOT_SERVER_DNS_NAME=${SAPOT_SERVER_DNS_NAME:-server.sapot.lan}

manifest_value() { python3 - "$1" "$2" <<'PY'
import json, sys
value=json.load(open(sys.argv[1], encoding="utf-8"))
for key in sys.argv[2].split('.'):
    value=value[key]
print(json.dumps(value) if isinstance(value, (dict, list, bool)) else value)
PY
}
check_schema() {
  local manifest=$1 actual
  actual=$(manifest_value "$manifest" schemaVersion)
  [ "$actual" = "2.0" ] || { log_error "Unsupported manifest schema version: got $actual, expected 2.0"; return 1; }
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
  local release=$1 target=$2 release_required=$3 image_bytes docker_root docker_store driver_type
  local path required margin free filesystem
  declare -A required_by_filesystem=() path_by_filesystem=()

  image_bytes=$(find "$release/images" -maxdepth 1 -type f -name '*.tar' -printf '%s\n' | awk '{total += $1} END {print total + 0}')
  docker_root=$(docker info --format '{{.DockerRootDir}}')
  driver_type=$(docker info --format '{{range .DriverStatus}}{{if eq (index . 0) "driver-type"}}{{index . 1}}{{end}}{{end}}' 2>/dev/null || true)
  docker_store=$docker_root
  if [ "$driver_type" = io.containerd.snapshotter.v1 ] && [ -d "${SAPOT_CONTAINERD_ROOT:-/var/lib/containerd}" ]; then
    docker_store=${SAPOT_CONTAINERD_ROOT:-/var/lib/containerd}
  fi

  [ -e "$target" ] && release_required=0
  for path in "$SAPOT_ROOT:$release_required" "$docker_store:$((image_bytes * 2))"; do
    required=${path##*:}
    path=${path%:*}
    filesystem=$(df -PB1 "$path" | awk 'NR==2 {print $1 " mounted on " $6}')
    required_by_filesystem["$filesystem"]=$(( ${required_by_filesystem["$filesystem"]:-0} + required ))
    path_by_filesystem["$filesystem"]=$path
  done

  for filesystem in "${!required_by_filesystem[@]}"; do
    required=${required_by_filesystem["$filesystem"]}
    margin=$((required * (100 + SAFETY_PERCENT) / 100))
    path=${path_by_filesystem["$filesystem"]}
    free=$(df -PB1 "$path" | awk 'NR==2 {print $4}')
    if [ "$free" -lt "$margin" ]; then
      log_error "insufficient free space on $filesystem: need $margin bytes, have $free"
      return 1
    fi
  done
}
load_image_archive() {
  local archive=$1 output status=0
  output=$(docker load -i "$archive" 2>&1) || status=$?
  [ -z "$output" ] || printf '%s\n' "$output"
  if [ "$status" -ne 0 ]; then
    log_error "failed to load Docker image archive $archive"
    return "$status"
  fi
  # Containerd-backed Docker can return success after reporting an unpack error.
  if grep -qi 'error unpacking image' <<< "$output"; then
    if grep -qi 'no space left on device' <<< "$output"; then
      log_error "Docker image store ran out of space while unpacking $archive"
    else
      log_error "Docker could not unpack image archive $archive"
    fi
    return 1
  fi
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
# install_systemd_units <release>
# Copies the units the bundle carries (systemd/, filled by build-bundle.sh) onto
# the host so a unit change reaches the host with the release that carries it.
# Install, upgrade, and rollback all call this; only install.sh enables anything.
# A host without systemd is a no-op rather than a failure - nothing else in these
# scripts needs it - and so is a bundle built before units were shipped.
# SAPOT_SYSTEMD_DIR exists so this can be exercised outside a real host.
install_systemd_units() {
  local release=$1 destination=${SAPOT_SYSTEMD_DIR:-/etc/systemd/system} units=()
  mapfile -t units < <(find "$release/systemd" -maxdepth 1 -type f \( -name '*.service' -o -name '*.timer' \) 2>/dev/null | sort)
  [ ${#units[@]} -gt 0 ] || return 0
  command -v systemctl >/dev/null 2>&1 || { log_warn "systemd not available - skipping unit installation"; return 0; }
  install -m 644 -t "$destination" "${units[@]}"
  systemctl daemon-reload
}
# provision_service_account
# The shipped units run as an unprivileged account, matching the bare-metal
# deployment. A bundle host has no such account: install.sh runs under sudo and
# creates everything as root. Create it and hand it exactly the three paths a
# scheduled backup touches - the env file it reads DATABASE_URL from, the
# directory it writes dumps to, and the lifecycle lock it takes so a backup can
# never run mid-migration. Owning server.env lets the account read the database
# password and JWT_SECRET_KEY; that trade is documented in runbooks.md.
provision_service_account() {
  local user=${SAPOT_SERVICE_USER:-sapot}
  id "$user" >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin "$user"
  # Bundle-mode backups shell out to docker compose.
  getent group docker >/dev/null 2>&1 && usermod -aG docker "$user"
  touch "$SAPOT_ROOT/.lock"
  chown "$user:$(id -gn "$user")" "$SAPOT_ROOT/shared/server.env" "$SAPOT_ROOT/shared/db-backups" "$SAPOT_ROOT/.lock"
}
prepare_env_files() {
  local release=$1 generated secret mysql_password
  mkdir -p "$SAPOT_ROOT/shared" "$SAPOT_ROOT/shared/certs" "$SAPOT_ROOT/shared/db-data" "$SAPOT_ROOT/shared/gsm-arduino-backups" "$SAPOT_ROOT/shared/db-backups"
  secret=$(openssl rand -hex 32); mysql_password=$(openssl rand -hex 32)
  for name in server admin gsm-fastapi gsm-arduino; do
    generated="$SAPOT_ROOT/shared/$name.env"
    [ -e "$generated" ] && continue
    sed -e "s/__GENERATE__/$secret/g" -e "s/__FROM_SERVER_GSM_SECRET__/$secret/g" -e "s/__FROM_SERVER_MYSQL_PASSWORD__/$mysql_password/g" -e "s/mysql+pymysql:\/\/sapot:$secret@db/mysql+pymysql:\/\/sapot:$mysql_password@db/" "$release/config/$name.env.example" > "$generated"
    [ "$name" = server ] && sed -i "s|mysql+pymysql://sapot:$secret@db|mysql+pymysql://sapot:$mysql_password@db|" "$generated"
    chmod 600 "$generated"
  done
}
