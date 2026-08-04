#!/usr/bin/env bash

acquire_lock() {
  local lock_path="${SAPOT_ROOT:-/opt/sapot}/.lock"
  mkdir -p "$(dirname "$lock_path")"
  exec 9>"$lock_path"
  if ! flock -n 9; then
    log_error "another operation is in progress"
    return 1
  fi
  trap 'flock -u 9 || true' EXIT
}
