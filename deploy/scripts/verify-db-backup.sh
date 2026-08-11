#!/usr/bin/env bash
# Restore a finalized dump only into a disposable, network-isolated MariaDB.
set -euo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SELF/lib/deploy-common.sh"
source "$SELF/lib/backup-lib.sh"

usage() { echo "usage: verify-db-backup.sh [--dry-run|--status]" >&2; exit 2; }
case "${1:-}" in '') ACTION=run ;; --dry-run) ACTION=dry-run ;; --status) ACTION=status ;; *) usage ;; esac
[ "$#" -le 1 ] || usage

fields=(); mapfile -t -d '' fields < <(resolve_backup_paths)
MODE=${fields[0]} RELEASE=${fields[1]} BACKUP_DIR=${fields[2]}
STATE="$BACKUP_DIR/verification-status.json"
STATUS_REASON= INTERNAL_MESSAGE= BACKUP= RUN_DIR= CONTAINER= VOLUME= DAEMON_PID= SUMMARY=
STARTED=$(date +%s); CLEANUP_ERROR=

cleanup() {
  local rc=$?
  [ -z "$CONTAINER" ] || docker rm -f "$CONTAINER" >/dev/null 2>&1 || CLEANUP_ERROR="container:$CONTAINER"
  [ -z "$VOLUME" ] || docker volume rm "$VOLUME" >/dev/null 2>&1 || CLEANUP_ERROR="volume:$VOLUME"
  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then kill "$DAEMON_PID" 2>/dev/null || true; wait "$DAEMON_PID" 2>/dev/null || CLEANUP_ERROR="daemon:$DAEMON_PID"; fi
  [ -z "$RUN_DIR" ] || rm -rf -- "$RUN_DIR" || CLEANUP_ERROR="run-directory:$RUN_DIR"
  return "$rc"
}
trap cleanup EXIT INT TERM

state_write() {
  local status=$1 reason=${2:-} message=${3:-} duration
  duration=$(( $(date +%s) - STARTED ))
  python3 - "$STATE" "$status" "$reason" "$message" "$BACKUP" "${COMPRESSED_SIZE:-}" "${BACKUP_MTIME:-}" "${SHA256:-}" "$duration" "${BACKEND:-}" "${SCHEMA_REVISION:-}" "${TABLES_CHECKED:-0}" "${ROWS_CHECKED:-0}" "${KEY_COUNTS:-{}}" <<'PY'
import json, os, sys, tempfile, time
(path, status, reason, message, filename, size, mtime, digest, duration, backend, revision, tables, rows, key_counts) = sys.argv[1:]
value = {"schemaVersion":"1.0", "status":status, "checkedAtEpoch":int(time.time()),
 "backupFilename":os.path.basename(filename) if filename else None,
 "compressedSize":int(size) if size else None, "backupMtimeEpoch":int(mtime) if mtime else None,
 "sha256":digest or None, "durationSeconds":int(duration), "backend":backend or "bundle-docker",
 "schemaRevision":revision or None, "tablesChecked":int(tables), "rowsChecked":int(rows),
 "keyTableCounts":json.loads(key_counts), "reason":None if status == "PASS" else reason,
 "message":message}
fd, temporary = tempfile.mkstemp(prefix=".verification-status.", dir=os.path.dirname(path))
try:
 os.fchmod(fd, 0o600)
 with os.fdopen(fd, "w", encoding="utf-8") as out:
  json.dump(value, out, separators=(",",":"), sort_keys=True); out.flush(); os.fsync(out.fileno())
 os.replace(temporary, path)
finally:
 if os.path.exists(temporary): os.unlink(temporary)
PY
}

fail() { STATUS_REASON=$1; INTERNAL_MESSAGE=$2; }
select_backup() {
  mkdir -p "$BACKUP_DIR"
  BACKUP=$(newest_finalized_backup "$BACKUP_DIR") || { [ "$?" = 1 ] && fail NO_BACKUP "no finalized backup" || fail INVALID_DUMP "newest backup filename or path is unsafe"; return 1; }
  BACKUP_MTIME=$(stat -c %Y -- "$BACKUP")
}

if [ "$ACTION" = status ]; then
  if ! validated=$(python3 "$SELF/lib/verification-state.py" "$STATE" 2>/dev/null); then log_error "backup restore verification state is missing or invalid"; exit 1; fi
  select_backup || { log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
  python3 - "$validated" "$BACKUP" <<'PY'
import json, os, sys
s=json.loads(sys.argv[1]); p=sys.argv[2]
if s["status"] != "PASS" or s["backupFilename"] != os.path.basename(p) or s["compressedSize"] != os.path.getsize(p) or s["backupMtimeEpoch"] != int(os.path.getmtime(p)):
 raise SystemExit(1)
print(json.dumps(s, indent=2, sort_keys=True))
PY
  exit $?
fi

umask 0077
mkdir -p "$BACKUP_DIR"
exec 8>"$BACKUP_DIR/.verify.lock"
if ! flock -n 8; then log_warn "backup restore verification already running"; exit 0; fi
select_backup || { state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
if [ "$MODE" = bundle ]; then BACKEND=bundle-docker; RUN_BASE="$BACKUP_DIR/.verify-runs"; else BACKEND=baremetal-local; RUN_BASE=${SAPOT_BACKUP_VERIFY_TMPDIR:-/var/tmp}; fi

multiplier=${SAPOT_BACKUP_VERIFY_DISK_MULTIPLIER:-2}; minimum=${SAPOT_BACKUP_VERIFY_MIN_FREE_BYTES:-1073741824}
[[ $multiplier =~ ^[1-9][0-9]*$ && $minimum =~ ^[0-9]+$ ]] || { fail INVALID_CONFIG "disk limits must be non-negative integers"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
mkdir -p "$RUN_BASE"; chmod 700 "$RUN_BASE" 2>/dev/null || true
RUN_ID="verify-$(date -u +%Y%m%dT%H%M%SZ)-$$"; RUN_DIR=$(mktemp -d "$RUN_BASE/$RUN_ID.XXXXXX"); chmod 700 "$RUN_DIR"
SUMMARY="$RUN_DIR/inspection.json"; exec {INSPECT_FD}<"$BACKUP"; exec {RESTORE_FD}<"$BACKUP"
if ! python3 "$SELF/lib/dump-inspector.py" --fd "$INSPECT_FD" --output "$SUMMARY"; then fail INVALID_DUMP "compressed dump inspection failed"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; fi
readarray -t values < <(python3 - "$SUMMARY" <<'PY'
import json,sys
s=json.load(open(sys.argv[1])); print(s['compressedSize']); print(s['sha256']); print(s['uncompressedSize']); print(s['totalRows']); print(len(s['tables']))
PY
)
COMPRESSED_SIZE=${values[0]}; SHA256=${values[1]}; UNCOMPRESSED=${values[2]}; ROWS_CHECKED=${values[3]}; TABLES_CHECKED=${values[4]}
if [ "$MODE" = bundle ]; then SPACE_PATH=$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true); else SPACE_PATH=$(realpath -e "$RUN_BASE"); fi
[ -n "$SPACE_PATH" ] || { fail RUNTIME_UNAVAILABLE "unable to locate temporary filesystem"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
readarray -t space < <(python3 - "$UNCOMPRESSED" "$multiplier" "$minimum" "$SPACE_PATH" <<'PY'
import os,sys
u,m,n,p=sys.argv[1:]; required=max(int(u)*int(m),int(n)); print(required); print(os.statvfs(p).f_bavail * os.statvfs(p).f_frsize)
PY
)
if [ "${space[1]}" -lt "${space[0]}" ]; then fail INSUFFICIENT_SPACE "temporary storage is below the verification requirement"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; fi
if [ "$ACTION" = dry-run ]; then log_info "selected $(basename "$BACKUP") using $BACKEND; need ${space[0]} bytes, have ${space[1]} bytes at $SPACE_PATH"; exit 0; fi

password=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n'); SECRETS="$RUN_DIR/secrets"; mkdir -m 700 "$SECRETS"
printf '%s\n' "$password" > "$SECRETS/root-password"; chmod 600 "$SECRETS/root-password"
printf '[client]\nuser=root\npassword="%s"\nprotocol=socket\n' "$password" > "$SECRETS/client.cnf"; chmod 600 "$SECRETS/client.cnf"
if [ "$MODE" = bundle ]; then
  image=$(manifest_value "$RELEASE/manifest.json" images.mariadb.tag 2>/dev/null || true)
  [ -n "$image" ] || { fail RUNTIME_UNAVAILABLE "bundle MariaDB image is unavailable"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
  CONTAINER="sapot-backup-verify-$RUN_ID"; VOLUME="sapot-backup-verify-$RUN_ID"
  docker volume create --label purpose=db-backup-verification --label run-id="$RUN_ID" --label owner-pid="$$" "$VOLUME" >/dev/null
  docker run -d --name "$CONTAINER" --network none --mount "type=volume,src=$VOLUME,dst=/var/lib/mysql" --mount "type=bind,src=$SECRETS,dst=/run/secrets,readonly" --env MARIADB_ROOT_PASSWORD_FILE=/run/secrets/root-password --label purpose=db-backup-verification --label run-id="$RUN_ID" --label owner-pid="$$" "$image" >/dev/null
  for _ in {1..60}; do docker exec "$CONTAINER" mariadb-admin --defaults-extra-file=/run/secrets/client.cnf ping --silent >/dev/null 2>&1 && break; sleep 5; done
  docker exec "$CONTAINER" mariadb-admin --defaults-extra-file=/run/secrets/client.cnf ping --silent >/dev/null 2>&1 || { fail START_TIMEOUT "disposable MariaDB did not become ready"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
  client=(docker exec -i "$CONTAINER" mariadb --defaults-extra-file=/run/secrets/client.cnf); check=(docker exec "$CONTAINER" mariadb-check --defaults-extra-file=/run/secrets/client.cnf)
else
  for command in mariadb-install-db mariadbd mariadb mariadb-admin mariadb-check; do command -v "$command" >/dev/null || { fail RUNTIME_UNAVAILABLE "missing $command"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }; done
  DATA="$RUN_DIR/data"; SOCKET="$RUN_DIR/mariadb.sock"; mariadb-install-db --no-defaults --datadir="$DATA" --auth-root-authentication-method=normal >/dev/null 2>&1
  mariadbd --no-defaults --datadir="$DATA" --socket="$SOCKET" --pid-file="$RUN_DIR/mariadb.pid" --skip-networking >"$RUN_DIR/daemon.log" 2>&1 & DAEMON_PID=$!
  for _ in {1..60}; do mariadb-admin --no-defaults --socket="$SOCKET" ping --silent >/dev/null 2>&1 && break; sleep 5; done
  mariadb-admin --no-defaults --socket="$SOCKET" ping --silent >/dev/null 2>&1 || { fail START_TIMEOUT "disposable MariaDB did not become ready"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
  client=(mariadb --no-defaults --socket="$SOCKET" -uroot); check=(mariadb-check --no-defaults --socket="$SOCKET" -uroot)
fi
"${client[@]}" -e 'CREATE DATABASE sapot_verify CHARACTER SET utf8mb4' || { fail RESTORE_FAILED "could not create disposable database"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
if ! gzip -dc <&$RESTORE_FD | "${client[@]}" sapot_verify 2>"$RUN_DIR/restore.stderr"; then fail RESTORE_FAILED "restore stream failed"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; fi
if ! "${check[@]}" --check sapot_verify >/dev/null; then fail STRUCTURE_FAILED "mariadb-check failed"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; fi
SCHEMA_REVISION=$("${client[@]}" -N -e 'SELECT version_num FROM sapot_verify.alembic_version' 2>/dev/null || true)
[[ $SCHEMA_REVISION =~ ^[0-9a-f]{12}$ ]] || { fail SCHEMA_INVALID "alembic revision is missing or invalid"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; }
if ! python3 - "$SUMMARY" "${client[*]}" <<'PY'
import json, subprocess, sys
s=json.load(open(sys.argv[1])); command=sys.argv[2].split(); actual={}
for name, expected in s['tables'].items():
 out=subprocess.check_output(command + ['-N', '-e', 'SELECT COUNT(*) FROM sapot_verify.`%s`' % name], text=True).strip()
 if not out.isdecimal() or int(out) != expected: raise SystemExit(1)
 actual[name]=int(out)
if sum(actual.values()) != s['totalRows']: raise SystemExit(1)
PY
then fail ROW_COUNT_MISMATCH "restored row counts differ from the inspected dump"; state_write FAIL "$STATUS_REASON" "$INTERNAL_MESSAGE"; log_error "backup restore verification failed [$STATUS_REASON]"; exit 1; fi
KEY_COUNTS=$(python3 - "$SUMMARY" <<'PY'
import json,sys
t=json.load(open(sys.argv[1]))['tables']; print(json.dumps({k:t[k] for k in ('user','conversation','message','announcement') if k in t}))
PY
)
cleanup
RUN_DIR= CONTAINER= VOLUME= DAEMON_PID=
if [ -n "$CLEANUP_ERROR" ]; then
  state_write FAIL CLEANUP_FAILED "verification succeeded but cleanup failed: $CLEANUP_ERROR"
  log_error "backup restore verification failed [CLEANUP_FAILED]"
  exit 1
fi
state_write PASS '' 'backup restored and validated'
log_pass "backup restore verification passed: $(basename "$BACKUP")"
