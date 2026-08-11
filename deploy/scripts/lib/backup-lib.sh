#!/usr/bin/env bash
# Pure, testable helpers for backup-db.sh and doctor.sh.
# Sourced, never executed directly. No database I/O, no locking, no docker.

_BACKUP_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./log.sh
source "$_BACKUP_LIB_DIR/log.sh"

# parse_database_url <env_file>
# Prints NUL-terminated: user, password, host, port, dbname.
parse_database_url() {
  local env_file=$1 url
  if [ ! -r "$env_file" ]; then
    log_error "env file not readable: $env_file"
    return 1
  fi
  url=$(grep -E '^[[:space:]]*DATABASE_URL=' "$env_file" | tail -n 1 | cut -d= -f2-)
  if [ -z "$url" ]; then
    log_error "no DATABASE_URL in $env_file"
    return 1
  fi
  DATABASE_URL="$url" python3 - <<'PY' || return 1
import os
import sys
from urllib.parse import unquote, urlparse

parsed = urlparse(os.environ["DATABASE_URL"])
user = unquote(parsed.username or "")
password = unquote(parsed.password or "")
host = parsed.hostname or ""
try:
    port = str(parsed.port or 3306)
except ValueError:
    sys.stderr.write("[ERROR] DATABASE_URL has an invalid port\n")
    raise SystemExit(1)
dbname = unquote(parsed.path or "").lstrip("/")

if not (user and password and host and dbname):
    sys.stderr.write("[ERROR] DATABASE_URL is missing user, password, host, or database name\n")
    raise SystemExit(1)

sys.stdout.write("\0".join([user, password, host, port, dbname]) + "\0")
PY
}

# resolve_backup_paths
# Prints NUL-terminated: mode, release_dir, backup_dir, env_file.
resolve_backup_paths() {
  local root=${SAPOT_ROOT:-/opt/sapot} mode release backup_dir env_file
  release=$(readlink -f "$root/releases/current" 2>/dev/null || true)
  if [ -n "$release" ] && [ -d "$release" ]; then
    mode=bundle
    backup_dir=${SAPOT_BACKUP_DIR:-$root/shared/db-backups}
    env_file=${SAPOT_SERVER_ENV:-$root/shared/server.env}
  else
    mode=baremetal
    release=""
    backup_dir=${SAPOT_BACKUP_DIR:-/home/sapot/backups}
    env_file=${SAPOT_SERVER_ENV:-/home/sapot/YLP-software/server/.env}
  fi
  printf '%s\0%s\0%s\0%s\0' "$mode" "$release" "$backup_dir" "$env_file"
}

# list_prunable <dir> <retention_days> <min_keep>
# Prints one path per line for dumps that prune_backups would delete.
list_prunable() {
  local dir=$1 days=$2 keep=$3 cutoff_stamp name stamp
  cutoff_stamp=$(date -u -d "@$(( $(date +%s) - days * 86400 ))" +%Y%m%dT%H%M%SZ)
  find "$dir" -maxdepth 1 -type f -name 'sapot_db_*.sql.gz' -printf '%f\0' 2>/dev/null \
    | LC_ALL=C sort -zr \
    | tail -zn "+$((keep + 1))" \
    | while IFS= read -r -d '' name; do
        stamp=${name#sapot_db_}
        stamp=${stamp%.sql.gz}
        if [[ ! $stamp =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
          log_warn "retention: skipping unrecognised name: $name"
          continue
        fi
        if [[ $stamp < $cutoff_stamp ]]; then
          printf '%s\n' "$dir/$name"
        fi
      done
}

# prune_backups <dir> <retention_days> <min_keep>
prune_backups() {
  local dir=$1 days=$2 keep=$3 path
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    if rm -f -- "$path"; then
      log_info "pruned $(basename -- "$path")"
    else
      log_warn "could not prune $path"
    fi
  done < <(list_prunable "$dir" "$days" "$keep")
  return 0
}

# sweep_stale_parts <dir>
sweep_stale_parts() {
  local dir=$1 path
  while IFS= read -r -d '' path; do
    rm -f -- "$path" && log_info "removed stale partial $(basename -- "$path")"
  done < <(find "$dir" -maxdepth 1 -type f -name 'sapot_db_*.part' -mmin +1440 -print0 2>/dev/null)
  return 0
}

# verify_dump_integrity <path>
verify_dump_integrity() {
  local path=$1
  if [ ! -s "$path" ]; then
    log_error "dump is missing or empty: $path"
    return 1
  fi
  if ! gzip -t "$path" 2>/dev/null; then
    log_error "dump failed gzip integrity check: $path"
    return 1
  fi
  if ! gzip -dc "$path" 2>/dev/null | tail -n 5 | grep -q -- '-- Dump completed'; then
    log_error "dump has no completion footer, it is truncated: $path"
    return 1
  fi
}

# write_defaults_file <out_path> <user> <password> <host> <port>
write_defaults_file() {
  local out=$1 user=$2 password=$3 host=$4 port=$5 escaped
  escaped=${password//\\/\\\\}
  escaped=${escaped//\"/\\\"}
  ( umask 077 && cat > "$out" <<EOF
[client]
user=$user
password="$escaped"
host=$host
port=$port
EOF
  ) || { log_error "could not write credentials file $out"; return 1; }
  chmod 600 "$out"
}

# newest_backup_epoch <dir>
newest_backup_epoch() {
  local dir=$1
  find "$dir" -maxdepth 1 -type f -name 'sapot_db_*.sql.gz' -printf '%T@\n' 2>/dev/null \
    | sort -rn | head -n 1 | cut -d. -f1
}

# newest_finalized_backup <dir>
# Prints the selected regular, non-symlink backup path.  The timestamp in its
# name, rather than mtime, is the ordering contract for restore verification.
newest_finalized_backup() {
  local dir=$1 now stamp name path selected="" selected_stamp=""
  now=$(date -u +%s)
  while IFS= read -r -d '' name; do
    [[ $name =~ ^sapot_db_([0-9]{8}T[0-9]{6}Z)\.sql\.gz$ ]] || continue
    stamp=${BASH_REMATCH[1]}
    if ! epoch=$(date -u -d "${stamp:0:4}-${stamp:4:2}-${stamp:6:2} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2} UTC" +%s 2>/dev/null) || [ "$epoch" -gt $((now + 300)) ]; then
      log_error "invalid or future-dated backup filename: $name"; return 2
    fi
    if [[ -z $selected_stamp || $stamp > $selected_stamp ]]; then selected=$name; selected_stamp=$stamp; fi
  done < <(find "$dir" -maxdepth 1 -type f -printf '%f\0' 2>/dev/null)
  [ -n "$selected" ] || return 1
  path=$(realpath -e -- "$dir/$selected") || return 2
  [[ $path == "$(realpath -e -- "$dir")"/* ]] && [ -f "$path" ] && [ ! -L "$dir/$selected" ] || return 2
  printf '%s\n' "$path"
}
