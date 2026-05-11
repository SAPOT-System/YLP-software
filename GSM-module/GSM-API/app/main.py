import os
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from typing import Union
from fastapi.middleware.cors import CORSMiddleware


from fastapi import FastAPI
from fastapi import Request
from starlette.responses import JSONResponse

import logging
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import jsonlogger
import time
from app.gsm.gsm_utils import DEFAULT_BAUD, DEFAULT_PORT, DEFAULT_PORT, run, setup_logging
import threading

from app.routes import sms

# On Windows: "C:/logs/fastapi_app"
LOG_DIR = os.path.abspath("../../../logs") 

# Create the directory if it doesn't exist
os.makedirs(LOG_DIR, exist_ok=True)

# Define full file paths
TEXT_LOG_PATH = os.path.join(LOG_DIR, "sms.log")
JSON_LOG_PATH = os.path.join(LOG_DIR, "sms.json")

@asynccontextmanager
async def lifespan(app: FastAPI):

    setup_logging(TEXT_LOG_PATH)

    thread = threading.Thread(
        target=run,
        args=(DEFAULT_PORT, DEFAULT_BAUD),
        daemon=True
    )

    thread.start()

    
    yield

app = FastAPI(
    title="SAPOT SMS server",
    description="A server for catering the GSM module and its features",
    summary="Serves endpoints meant to be ran locally",
    version="0.0.1",
    lifespan=lifespan
)

app.include_router(sms.router)

logger = logging.getLogger("app")
logger.setLevel(logging.INFO)

# --- Setup Handlers with the new paths ---
text_handler = RotatingFileHandler(TEXT_LOG_PATH, maxBytes=10**6, backupCount=3)
json_handler = RotatingFileHandler(JSON_LOG_PATH, maxBytes=10**6, backupCount=3)

# --- JSON Handler (Captures everything) ---
# --- Text Handler (Human Readable) ---
text_fmt = logging.Formatter("%(asctime)s | %(levelname)s | ACTION: %(action)s | %(message)s")
text_handler.setFormatter(text_fmt)
logger.addHandler(text_handler)

@app.middleware("http")
async def log_activity(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start_time) * 1000

    # 2. Prepare Log Data
    log_data = {
        "action": f"{request.method}_{request.url.path}",
        "entity_id": None, # Set this if you're tracking specific items
        "metadata_json": {
            "status_code": response.status_code,
            "duration_ms": round(duration, 2),
            "ip": request.client.host or None
        }
    }

    # 3. Log to Files (Text & JSON)
    # The 'extra' dict keys must match the formatter strings above
    logger.info(f"Handled {request.url.path}", extra=log_data)

    # 4. Log to Database
    return response

# 2. Create the folders if they don't exist
# exist_ok=True prevents an error if the folder is already there
@app.get("/")
def read_root():
    return {"state": "running"}
