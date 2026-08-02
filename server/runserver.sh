#!/bin/bash
set -euo pipefail

# Resolve all paths relative to this script's location so it works
# regardless of which user/host/checkout path it's run from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_VENV="$SCRIPT_DIR/app/venv"
LOG_DIR="$SCRIPT_DIR/logs"

cd "$SCRIPT_DIR"
mkdir -p "$LOG_DIR"

uv venv "$APP_VENV"
uv pip install --python "$APP_VENV/bin/python" \
  -r "$SCRIPT_DIR/app/requirements.txt"
  
# Apply any pending schema migrations before the app starts. Schema is owned
# by Alembic (server/alembic.ini) — do not fall back to create_all.
"$APP_VENV/bin/alembic" upgrade head

uv run "$APP_VENV/bin/gunicorn" app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 5 \
  -b 127.0.0.1:8000 \
  --timeout 130 \
  --graceful-timeout 30 \
  --worker-connections 200 \
  --max-requests 1000 \
  --max-requests-jitter 100 \
  --access-logfile "$LOG_DIR/gunicorn-access.log" \
  --error-logfile "$LOG_DIR/gunicorn-error.log"
