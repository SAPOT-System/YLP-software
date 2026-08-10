#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
current=$(readlink -f "$SAPOT_ROOT/releases/current" 2>/dev/null || true)
[ -n "$current" ] || { log_error "SAPOT is not installed"; exit 1; }

compose "$current" up -d db api
wait_healthy "$current" db
wait_healthy "$current" api
status=$(compose "$current" exec -T api python -m app.scripts.bootstrap_admin --status) || { log_error "could not check administrator status"; exit 1; }
state=$(printf '%s' "$status" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
if [ "$state" != missing ]; then
  log_pass "administrator already exists; bootstrap skipped"
  exit 0
fi

if [ "$(manifest_value "$SAPOT_ROOT/shared/state.json" gsmHardwarePresent)" = false ]; then
  log_warn "No GSM Arduino is configured. SMS password recovery will be unavailable."
fi
for attempt in 1 2 3; do
  read -r -p "Administrator username: " username
  read -r -p "First name: " first_name
  read -r -p "Last name: " last_name
  read -r -p "Philippine phone number (+639xxxxxxxxx): " phone_number
  read -r -p "Email (optional): " email
  read -r -s -p "Initial password: " password; echo
  read -r -s -p "Confirm initial password: " confirmation; echo
  [ "$password" = "$confirmation" ] || { log_error "Passwords do not match"; continue; }
  payload=$(printf '%s\0' "$username" "$first_name" "$last_name" "$phone_number" "$email" "$password" | python3 -c '
import json, sys
username, first_name, last_name, phone, email, password = sys.stdin.buffer.read().split(b"\0")[:-1]
print(json.dumps({"username": username.decode(), "first_name": first_name.decode(), "last_name": last_name.decode(), "phone_number": phone.decode() or None, "email": email.decode() or None, "password": password.decode(), "terms_accepted": False}))')
  if result=$(printf '%s' "$payload" | compose "$current" exec -T api python -m app.scripts.bootstrap_admin 2>&1); then
    log_pass "administrator created. The operator must change this password and accept the Terms & Conditions."
    exit 0
  else
    code=$?
  fi
  [ "$code" = 2 ] || { log_error "bootstrap infrastructure failure"; exit "$code"; }
  log_error "validation failed: $result"
done
log_error "administrator bootstrap failed after three attempts"
exit 2
