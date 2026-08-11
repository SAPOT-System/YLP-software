# shellcheck shell=bash

test_bundle_version_ordering() {
  local semver="$SELF/../lib/semver.py"
  assert_eq 1 "$(python3 "$semver" compare 0.0.2 0.0.1)" 'new bundle version sorts after current'
  assert_eq -1 "$(python3 "$semver" compare 0.0.1 0.0.2)" 'rollback target sorts before current'
}

test_bundle_schema_starts_fresh() {
  local dir; dir=$(mktemp -d); trap 'rm -rf "$dir"' RETURN
  printf '{"schemaVersion":"1.0"}\n' > "$dir/legacy.json"
  printf '{"schemaVersion":"2.0"}\n' > "$dir/current.json"
  (
    source "$SELF/../lib/deploy-common.sh"
    check_schema "$dir/legacy.json" >/dev/null 2>&1
  )
  assert_rc 1 $? 'legacy server-derived bundle schema is rejected'
  (
    source "$SELF/../lib/deploy-common.sh"
    check_schema "$dir/current.json" >/dev/null 2>&1
  )
  assert_rc 0 $? 'independent bundle schema is accepted'
}
