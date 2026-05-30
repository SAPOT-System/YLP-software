#!/bin/bash

source /home/sapot/YLP-software/server/app/venv/bin/activate
pip install -r /home/sapot/YLP-software/server/app/requirements.txt
export GSM_SECRET=change-me-to-a-strong-secret SAPOT_API_URL=http://localhost:8000 
export SERVER_ED25519_SEED=4932ff9c160683dd1097820825f51aecc0d5c066c6b7dbbe61d8c664f0bfa940
/home/sapot/YLP-software/server/app/venv/bin/gunicorn app.main:app   -k uvicorn.workers.UvicornWorker   -w 4   -b 0.0.0.0:8000 
