# shellcheck shell=bash

_parse_into() {
  local fields=()
  mapfile -t -d '' fields < <(parse_database_url "$1" 2>/dev/null)
  PU=${fields[0]:-}; PP=${fields[1]:-}; PH=${fields[2]:-}; PPORT=${fields[3]:-}; PDB=${fields[4]:-}
}

test_parse_database_url() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  printf '# DATABASE_URL=mysql+pymysql://wrong:wrong@wrong/wrong\nDATABASE_URL=mysql+pymysql://sapot:p%%40ss%%3Aword@db/sapot\n' > "$dir/.env"
  _parse_into "$dir/.env"
  assert_eq sapot "$PU" 'parsed user'
  assert_eq 'p@ss:word' "$PP" 'decoded password'
  assert_eq db "$PH" 'parsed host'
  assert_eq 3306 "$PPORT" 'default port'
  assert_eq sapot "$PDB" 'parsed database'
  parse_database_url "$dir/missing" >/dev/null 2>&1; assert_rc 1 $? 'missing env fails'
}

test_defaults_file_is_private_and_escaped() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  write_defaults_file "$dir/b.cnf" sapot 'a"b\c#d' db 3306
  assert_eq 600 "$(stat -c '%a' "$dir/b.cnf")" 'credentials file is private'
  assert_eq 'password="a\"b\\c#d"' "$(grep '^password=' "$dir/b.cnf")" 'credentials safely escaped'
}
