#!/bin/bash

APP_VENV=/home/sapot/YLP-software/server/app/venv

uv venv "$APP_VENV"
uv pip install --python "$APP_VENV/bin/python" \
  -r /home/sapot/YLP-software/server/app/requirements.txt

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
  --access-logfile ../logs/gunicorn-access.log \
  --error-logfile ../logs/gunicorn-error.log
