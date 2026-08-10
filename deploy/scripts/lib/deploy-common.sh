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
  local release=$1 generated secret mysql_password status_password
  mkdir -p "$SAPOT_ROOT/shared" "$SAPOT_ROOT/shared/certs" "$SAPOT_ROOT/shared/db-data" "$SAPOT_ROOT/shared/gsm-arduino-backups"
  secret=$(openssl rand -hex 32); mysql_password=$(openssl rand -hex 32); status_password=$(openssl rand -hex 32)
  for name in server admin gsm-fastapi gsm-arduino status; do
    generated="$SAPOT_ROOT/shared/$name.env"
    [ -e "$generated" ] && continue
    sed -e "s/__GENERATE__/$secret/g" -e "s/__FROM_SERVER_GSM_SECRET__/$secret/g" -e "s/__FROM_SERVER_MYSQL_PASSWORD__/$mysql_password/g" -e "s/__STATUS_DB_PASSWORD__/$status_password/g" -e "s/mysql+pymysql:\/\/sapot:$secret@db/mysql+pymysql:\/\/sapot:$mysql_password@db/" "$release/config/$name.env.example" > "$generated"
    [ "$name" = server ] && sed -i "s|mysql+pymysql://sapot:$secret@db|mysql+pymysql://sapot:$mysql_password@db|" "$generated"
    chmod 600 "$generated"
  done
}
prepare_shared_dirs() {
  local uid gid
  mkdir -p "$SAPOT_ROOT/shared/status" "$SAPOT_ROOT/shared/logs/api" "$SAPOT_ROOT/shared/logs/gsm"
  uid=$(docker run --rm --entrypoint id sapot/api:bundle -u 2>/dev/null || true)
  gid=$(docker run --rm --entrypoint id sapot/api:bundle -g 2>/dev/null || true)
  if [ -n "$uid" ] && [ -n "$gid" ]; then
    chown -R "$uid:$gid" "$SAPOT_ROOT/shared/status" "$SAPOT_ROOT/shared/logs/api" 2>/dev/null || log_error "could not chown shared writable directories"
  else log_error "could not determine api image uid"; fi
}
provision_status_db_user() {
  local release=$1 root_password status_password attempts=24
  root_password=$(grep '^MYSQL_ROOT_PASSWORD=' "$SAPOT_ROOT/shared/server.env" | cut -d= -f2-)
  status_password=$(sed -n 's|^STATUS_DATABASE_URL=mysql+pymysql://sapot_status:\([^@]*\)@.*|\1|p' "$SAPOT_ROOT/shared/status.env")
  [ -n "$root_password" ] && [ -n "$status_password" ] || { log_error "missing status database credentials"; return 1; }
  compose "$release" exec -T -e MYSQL_PWD="$root_password" db mariadb -uroot <<SQL
CREATE USER IF NOT EXISTS 'sapot_status'@'%' IDENTIFIED BY '$status_password';
ALTER USER 'sapot_status'@'%' IDENTIFIED BY '$status_password';
GRANT SELECT ON sapot.message TO 'sapot_status'@'%';
GRANT SELECT ON sapot.activity_logs TO 'sapot_status'@'%';
FLUSH PRIVILEGES;
SQL
  while [ "$attempts" -gt 0 ]; do
    if compose "$release" exec -T -e MYSQL_PWD="$root_password" db mariadb -uroot -N -B -e "SELECT 1 FROM information_schema.tables WHERE table_schema='sapot' AND table_name='sms_log'" 2>/dev/null | grep -q 1; then
      compose "$release" exec -T -e MYSQL_PWD="$root_password" db mariadb -uroot -e "GRANT SELECT ON sapot.sms_log TO 'sapot_status'@'%'; FLUSH PRIVILEGES;"
      return 0
    fi
    sleep 5; attempts=$((attempts - 1))
  done
  log_error "sms_log did not appear; GSM pending count unavailable until reprovisioned"
}
write_integrity() {
  local status=$1 dir="$SAPOT_ROOT/shared/status" tmp
  mkdir -p "$dir"; tmp="$dir/.integrity.json.tmp"
  printf '{"status": "%s", "verifiedAt": "%s"}\n' "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$tmp"
  mv -f "$tmp" "$dir/integrity.json"
}
