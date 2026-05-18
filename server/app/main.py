import os
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from typing import Union
from fastapi.middleware.cors import CORSMiddleware


from fastapi import FastAPI
from fastapi import Request
from starlette.responses import JSONResponse

from app.api import gsm, user_utils
from app.db_operations.activity import activity_tracking_middleware
from app.db_operations.auth import SessionDep, create_db_and_tables
from app.api import auth, forgot_password, verify_email, peer_connection, ping, update_info, sync, profile_picture, gps, admin, testing, public_chat, mikrotik, captive_portal

import logging
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import jsonlogger
import time
from app.db_operations.auth import SessionDep, engine
from app.db_operations.router_metrics_collector import collect_metrics
from app.models.activity import ActivityLog
from app.db_operations.token import get_user_id_from_header


@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    threading.Thread(target=collect_metrics, daemon=True).start()
    create_db_and_tables()
    yield

app = FastAPI(
    title="SAPOT Server",
    description="A server that will mitigate the backend of the SAPOT mobile application",
    summary="A server that contains secure endpoint for the use of a mobile application",
    version="0.0.1",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def track_user_activity(request: Request, call_next):
    return await activity_tracking_middleware(request, call_next)

logger = logging.getLogger("app")
logger.setLevel(logging.INFO)

# On Windows: "C:/logs/fastapi_app"
LOG_DIR = os.path.abspath("../logs") 

# Create the directory if it doesn't exist
os.makedirs(LOG_DIR, exist_ok=True)

# Define full file paths
TEXT_LOG_PATH = os.path.join(LOG_DIR, "activity.log")
JSON_LOG_PATH = os.path.join(LOG_DIR, "activity.json")

# --- Setup Handlers with the new paths ---
text_handler = RotatingFileHandler(TEXT_LOG_PATH, maxBytes=10**6, backupCount=3)
json_handler = RotatingFileHandler(JSON_LOG_PATH, maxBytes=10**6, backupCount=3)

# --- JSON Handler (Captures everything) ---
# The format string defines which 'extra' keys to include in the JSON
json_fmt = jsonlogger.JsonFormatter("%(asctime)s %(levelname)s %(user_id)s %(action)s %(entity_id)s %(metadata_json)s %(message)s")
json_handler.setFormatter(json_fmt)
logger.addHandler(json_handler)

# --- Text Handler (Human Readable) ---
text_fmt = logging.Formatter("%(asctime)s | %(levelname)s | USER: %(user_id)s | ACTION: %(action)s | %(message)s")
text_handler.setFormatter(text_fmt)
logger.addHandler(text_handler)

from uuid import UUID, uuid4
from sqlmodel import Session
# ... (your other imports)

@app.middleware("http")
async def log_activity(request: Request, call_next):
    user_id = get_user_id_from_header(request)
    # 1. Identify User (Example: get from state or header)
    # If you have auth middleware, user_id might be in request.state.user_id
    current_user_id = user_id
    
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start_time) * 1000

    # 2. Prepare Log Data
    log_data = {
        "user_id": str(current_user_id) if current_user_id else "ANONYMOUS",
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
    if current_user_id: # Usually you only save certain activities to DB
        with Session(engine) as session:
            try:
                db_log = ActivityLog(
                    user_id=UUID(current_user_id),
                    action=log_data["action"],
                    entity_id=log_data["entity_id"],
                    metadata_json=log_data["metadata_json"]
                )
                session.add(db_log)
                session.commit()
            except:
                pass

    return response


app.include_router(auth.router)
app.include_router(forgot_password.router)
app.include_router(verify_email.router)
app.include_router(peer_connection.router)
app.include_router(ping.router)
app.include_router(user_utils.router)
app.include_router(update_info.router)
app.include_router(sync.router)
app.include_router(profile_picture.router)
app.include_router(gps.router)
app.include_router(admin.router)
# delete when going to production
app.include_router(testing.router)
app.include_router(public_chat.router)
app.include_router(gsm.router)
app.include_router(captive_portal.router)
app.include_router(mikrotik.router)

STATIC_PATH = "static"
PROFILE_PICS_PATH = os.path.join(STATIC_PATH, "profile_pictures")

# 2. Create the folders if they don't exist
# exist_ok=True prevents an error if the folder is already there
os.makedirs(PROFILE_PICS_PATH, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return {"state": "running"}
