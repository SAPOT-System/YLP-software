# shellcheck shell=bash

_dump_name() { date -u -d "$1 days ago" +sapot_db_%Y%m%dT%H%M%SZ.sql.gz; }
_mkdump() { printf dump | gzip > "$1/$(_dump_name "$2")"; }

test_prune_backups() {
  local dir age; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  for age in $(seq 0 13) $(seq 15 20); do _mkdump "$dir" "$age"; done
  prune_backups "$dir" 14 3 >/dev/null
  assert_eq 14 "$(find "$dir" -type f -name 'sapot_db_*.sql.gz' | wc -l)" 'prunes expired timestamped backups past floor'
  printf dump | gzip > "$dir/sapot_db_unparseable.sql.gz"
  prune_backups "$dir" 0 0 >/dev/null
  assert_eq 1 "$([ -e "$dir/sapot_db_unparseable.sql.gz" ] && echo 1 || echo 0)" 'never prunes unparseable names'
}
