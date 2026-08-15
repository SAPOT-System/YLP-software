#!/bin/sh
set -eu

port_file="$(mktemp)"
cleanup() {
    if [ -n "${gateway_pid:-}" ]; then
        kill "$gateway_pid" 2>/dev/null || true
    fi
    if [ -n "${modem_pid:-}" ]; then
        kill "$modem_pid" 2>/dev/null || true
    fi
    rm -f "$port_file"
}
trap cleanup EXIT INT TERM

python -u mock_modem.py --port-file "$port_file" \
    --web-host "${VIRTUAL_PHONE_HOST:-127.0.0.1}" \
    --web-port "${VIRTUAL_PHONE_PORT:-8002}" &
modem_pid=$!

while [ ! -s "$port_file" ]; do
    if ! kill -0 "$modem_pid" 2>/dev/null; then
        wait "$modem_pid"
    fi
    sleep 0.1
done

export SERIAL_PORT="$(cat "$port_file")"
python main.py &
gateway_pid=$!
wait "$gateway_pid"
