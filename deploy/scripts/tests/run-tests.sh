#!/usr/bin/env bash
# Minimal pure-bash test runner for the backup library. No external deps.
set -uo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SELF/../lib/backup-lib.sh"

PASS=0
FAIL=0
FILTER=${1:-}

assert_eq() {
  local expected=$1 actual=$2 message=$3
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    printf '  FAIL %s\n       expected: [%s]\n       actual:   [%s]\n' "$message" "$expected" "$actual" >&2
  fi
}

assert_rc() { assert_eq "rc=$1" "rc=$2" "$3"; }

for file in "$SELF"/test_*.bash; do
  [ -e "$file" ] || continue
  source "$file"
done

for fn in $(declare -F | awk '{print $3}' | grep '^test_' | sort); do
  [ -n "$FILTER" ] && [[ "$fn" != *"$FILTER"* ]] && continue
  printf '%s\n' "$fn"
  "$fn"
done

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
