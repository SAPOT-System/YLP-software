# shellcheck shell=bash

_good_dump() { { printf '%s\n' '-- MariaDB dump'; printf '%s\n' '-- Dump completed on now'; } | gzip > "$1"; }

test_integrity_and_newest_backup() {
  local dir epoch; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  _good_dump "$dir/good.sql.gz"; verify_dump_integrity "$dir/good.sql.gz" >/dev/null 2>&1; assert_rc 0 $? 'complete dump accepted'
  printf incomplete | gzip > "$dir/bad.sql.gz"; verify_dump_integrity "$dir/bad.sql.gz" >/dev/null 2>&1; assert_rc 1 $? 'dump without footer rejected'
  printf x | gzip > "$dir/sapot_db_a.sql.gz"; touch -d '5 days ago' "$dir/sapot_db_a.sql.gz"
  printf x | gzip > "$dir/sapot_db_b.sql.gz"; touch -d '1 day ago' "$dir/sapot_db_b.sql.gz"
  epoch=$(newest_backup_epoch "$dir")
  assert_eq "$(date -d '1 day ago' +%s)" "$epoch" 'finds newest dump by mtime'
}
