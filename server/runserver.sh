#!/bin/bash

source /home/sapot/YLP-software/server/app/venv/bin/activate
pip install -r /home/sapot/YLP-software/server/app/requirements.txt
/home/sapot/YLP-software/server/app/venv/bin/gunicorn app.main:app   -k uvicorn.workers.UvicornWorker   -w 4   -b 0.0.0.0:8000 
