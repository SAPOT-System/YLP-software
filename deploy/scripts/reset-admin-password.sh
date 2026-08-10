#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true)
[ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }
read -r -p "Administrator username: " username
lookup=$(printf '%s\0' "$username" | python3 -c '
import json,sys
username = sys.stdin.buffer.read().split(b"\0")[0]
print(json.dumps({"username": username.decode()}))')
if result=$(printf '%s' "$lookup" | compose "$current" exec -T api python -m app.scripts.reset_admin_password --lookup); then
  :
else
  code=$?
  [ "$code" = 2 ] && log_error "administrator not found or is not an administrator" || log_error "administrator lookup failed"
  exit "$code"
fi
name=$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin)["full_name"])')
read -r -p "Reset password for $name? [y/N] " answer
[[ "$answer" =~ ^[Yy]$ ]] || { log_warn "password reset cancelled"; exit 0; }
read -r -s -p "New password: " password; echo
read -r -s -p "Confirm new password: " confirmation; echo
[ "$password" = "$confirmation" ] || { log_error "Passwords do not match"; exit 2; }
payload=$(printf '%s\0' "$username" "$password" | python3 -c '
import json,sys
username, password = sys.stdin.buffer.read().split(b"\0")[:-1]
print(json.dumps({"username": username.decode(), "password": password.decode()}))')
if result=$(printf '%s' "$payload" | compose "$current" exec -T api python -m app.scripts.reset_admin_password); then
  log_pass "password reset. The replacement password must be changed by the administrator on next login."
else
  # stdout carries the only explanation of a rejected password; discarding it
  # leaves the operator with a script that dies without saying why.
  code=$?
  log_error "password reset failed: $result"
  exit "$code"
fi
