# shellcheck shell=bash

test_resolve_backup_paths() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  ( export SAPOT_ROOT="$dir/absent"; unset SAPOT_BACKUP_DIR SAPOT_SERVER_ENV
    local fields=(); mapfile -t -d '' fields < <(resolve_backup_paths)
    assert_eq baremetal "${fields[0]}" 'bare-metal when no current release'
    assert_eq /home/sapot/backups "${fields[2]}" 'bare-metal backup default' )
  mkdir -p "$dir/releases/v1" "$dir/shared"; ln -s "$dir/releases/v1" "$dir/releases/current"
  ( export SAPOT_ROOT="$dir" SAPOT_BACKUP_DIR=/mnt/backups SAPOT_SERVER_ENV=/etc/sapot.env
    local fields=(); mapfile -t -d '' fields < <(resolve_backup_paths)
    assert_eq bundle "${fields[0]}" 'bundle when current release exists'
    assert_eq "$dir/releases/v1" "${fields[1]}" 'resolved release'
    assert_eq /mnt/backups "${fields[2]}" 'backup override'
    assert_eq /etc/sapot.env "${fields[3]}" 'env override' )
}

test_newest_finalized_backup_uses_filename_timestamp() {
  local dir path; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  : > "$dir/sapot_db_20260101T000000Z.sql.gz"
  : > "$dir/sapot_db_20260102T000000Z.sql.gz"
  touch -d '2020-01-01' "$dir/sapot_db_20260102T000000Z.sql.gz"
  path=$(newest_finalized_backup "$dir")
  assert_eq "$dir/sapot_db_20260102T000000Z.sql.gz" "$path" 'verification selects by filename timestamp, not mtime'
}

test_newest_finalized_backup_rejects_future_artifact() {
  local dir stamp; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  stamp=$(date -u -d '10 minutes' +%Y%m%dT%H%M%SZ)
  : > "$dir/sapot_db_${stamp}.sql.gz"
  newest_finalized_backup "$dir" >/dev/null 2>&1
  assert_rc 2 $? 'future-dated finalized artifact is invalid'
}
