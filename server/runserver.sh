#!/bin/bash
set -euo pipefail

# cd to script's own directory so `app.main:app` is always importable
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_VENV="$SCRIPT_DIR/app/venv"
LOGS_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOGS_DIR"

[ -d "$APP_VENV" ] || uv venv "$APP_VENV"
uv pip install --python "$APP_VENV/bin/python" \
  -r "$SCRIPT_DIR/app/requirements.txt"

exec "$APP_VENV/bin/gunicorn" app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 5 \
  -b 127.0.0.1:8000 \
  --timeout 130 \
  --graceful-timeout 30 \
  --worker-connections 200 \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --access-logfile "$LOGS_DIR/gunicorn-access.log" \
  --error-logfile "$LOGS_DIR/gunicorn-error.log"
