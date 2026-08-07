#!/usr/bin/env bash
# Dumps the SAPOT MariaDB database, gzipped and timestamped, applies
# retention, and optionally copies it to removable media.
set -euo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=./lib/deploy-common.sh
source "$SELF/lib/deploy-common.sh"
# shellcheck source=./lib/backup-lib.sh
source "$SELF/lib/backup-lib.sh"

case "${1:-}" in
  '') DRY_RUN=false ;;
  --dry-run) DRY_RUN=true ;;
  *) log_error "usage: backup-db.sh [--dry-run]"; exit 1 ;;
esac

RETENTION_DAYS=${SAPOT_BACKUP_RETENTION_DAYS:-14}
MIN_KEEP=${SAPOT_BACKUP_MIN_KEEP:-3}
OFFHOST_DIR=${SAPOT_BACKUP_OFFHOST_DIR:-}
fields=()
mapfile -t -d '' fields < <(resolve_backup_paths)
MODE=${fields[0]} RELEASE=${fields[1]} BACKUP_DIR=${fields[2]} ENV_FILE=${fields[3]}

mkdir -p "$BACKUP_DIR"

if "$DRY_RUN"; then
  log_info "mode:        $MODE"
  log_info "release:     ${RELEASE:-n/a}"
  log_info "backup dir:  $BACKUP_DIR"
  log_info "env file:    $ENV_FILE"
  log_info "retention:   ${RETENTION_DAYS}d, keeping at least $MIN_KEEP"
  log_info "off-host:    ${OFFHOST_DIR:-not configured}"
  log_info 'would prune:'
  list_prunable "$BACKUP_DIR" "$RETENTION_DAYS" "$MIN_KEEP" | sed 's/^/  /' || true
  exit 0
fi

if [ "$MODE" = bundle ]; then
  if ! acquire_lock; then
    log_warn 'a lifecycle operation is in progress, skipping this backup'
    exit 0
  fi
else
  exec 9>"$BACKUP_DIR/.lock"
  if ! flock -n 9; then
    log_warn 'another backup is already running, skipping this one'
    exit 0
  fi
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"; flock -u 9 2>/dev/null || true' EXIT

if ! parse_database_url "$ENV_FILE" > "$TMP_DIR/creds"; then
  log_error "could not resolve database credentials from $ENV_FILE"
  exit 1
fi
db=()
mapfile -t -d '' db < "$TMP_DIR/creds"
rm -f "$TMP_DIR/creds"
DB_USER=${db[0]} DB_PASS=${db[1]} DB_HOST=${db[2]} DB_PORT=${db[3]} DB_NAME=${db[4]}

CNF="$TMP_DIR/backup.cnf"
write_defaults_file "$CNF" "$DB_USER" "$DB_PASS" "$DB_HOST" "$DB_PORT"
sweep_stale_parts "$BACKUP_DIR"

newest=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'sapot_db_*.sql.gz' -printf '%T@ %s\n' 2>/dev/null | sort -rn | head -n 1 | awk '{print $2}')
if [ -n "$newest" ]; then
  required=$((newest * 2))
  free=$(df -PB1 "$BACKUP_DIR" | awk 'NR==2 {print $4}')
  if [ "$free" -lt "$required" ]; then
    log_error "insufficient space in $BACKUP_DIR: need $required bytes, have $free"
    exit 1
  fi
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="sapot_db_${STAMP}.sql.gz"
PART="$BACKUP_DIR/${NAME}.part"
FINAL="$BACKUP_DIR/$NAME"
log_info "starting backup of $DB_NAME ($MODE mode) to $NAME"

if [ "$MODE" = bundle ]; then
  compose "$RELEASE" exec -T db sh -c \
    'umask 077; cat > /tmp/b.cnf; mysqldump --defaults-extra-file=/tmp/b.cnf --single-transaction --routines --triggers --events "$0"; rc=$?; rm -f /tmp/b.cnf; exit $rc' \
    "$DB_NAME" < "$CNF" | gzip > "$PART"
else
  mysqldump --defaults-extra-file="$CNF" --single-transaction --routines --triggers --events "$DB_NAME" | gzip > "$PART"
fi

if ! verify_dump_integrity "$PART"; then
  rm -f "$PART"
  log_error 'backup failed integrity check and was discarded; previous backups are untouched'
  exit 1
fi

mv "$PART" "$FINAL"
log_pass "backup written: $FINAL ($(du -h "$FINAL" | cut -f1))"
prune_backups "$BACKUP_DIR" "$RETENTION_DAYS" "$MIN_KEEP"

if [ -z "$OFFHOST_DIR" ]; then
  log_info 'off-host copy not configured (set SAPOT_BACKUP_OFFHOST_DIR)'
elif [ ! -d "$OFFHOST_DIR" ] || [ ! -w "$OFFHOST_DIR" ]; then
  log_warn "off-host target $OFFHOST_DIR unavailable; on-host dump retained"
elif cp "$FINAL" "$OFFHOST_DIR/${NAME}.part" && mv "$OFFHOST_DIR/${NAME}.part" "$OFFHOST_DIR/$NAME"; then
  sync -f "$OFFHOST_DIR/$NAME" 2>/dev/null || sync
  log_pass "off-host copy written: $OFFHOST_DIR/$NAME"
else
  rm -f "$OFFHOST_DIR/${NAME}.part"
  log_warn "off-host copy to $OFFHOST_DIR failed; on-host dump retained"
fi

log_pass 'backup complete'
