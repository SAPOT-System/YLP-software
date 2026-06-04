#!/bin/bash

[ -f /home/sapot/certs/server.key ] || { echo "ERROR: TLS key not found at /home/sapot/certs/server.key"; exit 1; }
[ -f /home/sapot/certs/server.crt ] || { echo "ERROR: TLS cert not found at /home/sapot/certs/server.crt"; exit 1; }

source /home/sapot/YLP-software/server/app/venv/bin/activate
pip install -r /home/sapot/YLP-software/server/app/requirements.txt
/home/sapot/YLP-software/server/app/venv/bin/gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  -w 4 \
  -b 0.0.0.0:8000 \
  --keyfile /home/sapot/certs/server.key \
  --certfile /home/sapot/certs/server.crt
