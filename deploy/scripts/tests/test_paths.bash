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
