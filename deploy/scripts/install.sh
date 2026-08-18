#!/usr/bin/env bash
set -euo pipefail
SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); source "$SELF/lib/deploy-common.sh"
source_release=$(cd "$SELF/.." && pwd); source_manifest="$source_release/manifest.json"
check_schema "$source_manifest"; acquire_lock
version=$(manifest_value "$source_manifest" version)
if [ -L "$SAPOT_ROOT/releases/current" ] || [ -e "$SAPOT_ROOT/releases/current" ]; then
  current=$(manifest_value "$(readlink -f "$SAPOT_ROOT/releases/current")/manifest.json" version)
  log_error "already installed (v$current) - use upgrade.sh instead"; exit 1
fi
verify_checksums "$source_release" || { log_error "bundle checksum verification failed"; exit 1; }
# Locate and validate the CA USB stick before anything is copied or started.
# There is no self-signed fallback: the mobile app pins this CA, so a leaf it
# did not issue leaves every production handset unable to connect.
ca_dir=$(ca_find_dir); ca_verify_dir "$ca_dir"
target="$SAPOT_ROOT/releases/v$version"
disk_preflight "$source_release" "$target" "$(manifest_value "$source_manifest" requiredDiskBytes)"
mkdir -p "$SAPOT_ROOT/releases"
[ ! -e "$target" ] && cp -a "$source_release" "$target"
prepare_env_files "$target"
ip=$($target/certs/detect-ip.sh 2>/dev/null || true)
[ -n "$ip" ] || { read -r -p "LAN IP for TLS certificate: " ip; }
ca_issue_leaf "$SAPOT_ROOT/shared/certs" "$ip" "$ca_dir" false
log_info "certificate issued - the CA USB stick can be unplugged now"
shopt -s nullglob
detected_ports=(/dev/ttyACM* /dev/ttyUSB*)
shopt -u nullglob

hardware=false
selected_port=""

if [ ${#detected_ports[@]} -eq 0 ]; then
  read -r -p "No GSM Arduino detected. Enter port path manually or leave empty to skip: " answer
  if [ -n "$answer" ]; then
    selected_port="$answer"
    hardware=true
  fi
elif [ ${#detected_ports[@]} -eq 1 ]; then
  read -r -p "Found GSM Arduino at ${detected_ports[0]}. Use this? [Y/n/custom] " answer
  if [[ "$answer" =~ ^[Yy]$ ]] || [ -z "$answer" ]; then
    selected_port="${detected_ports[0]}"
    hardware=true
  elif [[ "$answer" =~ ^[Cc]ustom$ ]]; then
    read -r -p "Enter custom port path: " selected_port
    if [ -n "$selected_port" ]; then hardware=true; fi
  fi
else
  echo "Multiple GSM Arduino devices found:"
  for i in "${!detected_ports[@]}"; do
    echo "  $((i+1))) ${detected_ports[$i]}"
  done
  read -r -p "Select a number, type a custom path, or leave empty to skip: " answer
  if [[ "$answer" =~ ^[0-9]+$ ]] && [ "$answer" -ge 1 ] && [ "$answer" -le "${#detected_ports[@]}" ]; then
    selected_port="${detected_ports[$((answer-1))]}"
    hardware=true
  elif [ -n "$answer" ]; then
    selected_port="$answer"
    hardware=true
  fi
fi

if [ "$hardware" = true ] && [ -n "$selected_port" ]; then
  sed -i "s|^GSM_ARDUINO_PORT=.*|GSM_ARDUINO_PORT=$selected_port|" "$SAPOT_ROOT/shared/gsm-arduino.env"
  sed -i "s|^SERIAL_PORT=.*|SERIAL_PORT=$selected_port|" "$SAPOT_ROOT/shared/gsm-fastapi.env"
fi
for image in "$target"/images/*.tar; do load_image_archive "$image"; done
"$VERIFY_DIGESTS" "$target/manifest.json"
compose "$target" up -d db redis; wait_healthy "$target" db; wait_healthy "$target" redis
compose "$target" run --rm api alembic upgrade head
compose "$target" up -d; for _ in {1..36}; do curl -kfs https://localhost/version >/dev/null 2>&1 && break; sleep 5; done
curl -kfsS https://localhost/version >/dev/null || { log_error "nginx/api did not become ready"; exit 1; }
ln -sfn "$target" "$SAPOT_ROOT/releases/current"; write_state install "" "$version" "$hardware"
# Scheduled backups are the one part of this deployment that is useless when
# left off, so install enables them rather than leaving it to a later manual
# step. This is the only thing here that writes outside $SAPOT_ROOT and Docker
# state; see docs/deployment/docker-bundle.md.
install_systemd_units "$target"
# Guarded on the unit actually landing, which covers both a host without systemd
# and a bundle built before units shipped.
if [ -e "${SAPOT_SYSTEMD_DIR:-/etc/systemd/system}/sapot-db-backup.timer" ]; then
  provision_service_account
  systemctl enable --now sapot-db-backup.timer
  log_info "scheduled database backups enabled (sapot-db-backup.timer)"
fi
"$SELF/lib/retention.sh"; log_pass "installed SAPOT v$version"
# The install is complete and recorded by this point. Release the lock before an
# unbounded interactive prompt, and never let a fumbled or cancelled bootstrap
# report a successful install as a failure - the stack is up either way.
flock -u 9 || true
"$SAPOT_ROOT/releases/current/scripts/bootstrap-admin.sh" || log_warn "no administrator was created - run scripts/bootstrap-admin.sh to finish setup"
