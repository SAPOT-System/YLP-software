#!/usr/bin/env bash
set -euo pipefail

SELF=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SELF/lib/deploy-common.sh"

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
  log_info "Updated port configuration to $selected_port"
else
  log_info "No hardware port selected. GSM hardware will be disabled."
fi

# Update state.json
python3 - "$SAPOT_ROOT/shared/state.json" "$hardware" <<'PY'
import json, sys, os
path = sys.argv[1]
if not os.path.exists(path):
    sys.exit(0)
with open(path, 'r') as f:
    state = json.load(f)
state["gsmHardwarePresent"] = sys.argv[2] == "true"
tmp = path + ".tmp"
with open(tmp, 'w') as f:
    json.dump(state, f, indent=2)
os.replace(tmp, path)
PY

log_info "State updated successfully. You can now rerun the gsm-fastapi container."
