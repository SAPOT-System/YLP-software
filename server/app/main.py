import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from typing import Union
from fastapi.middleware.cors import CORSMiddleware

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from fastapi import FastAPI
from fastapi import Request
from starlette.responses import JSONResponse

from app.env import IS_QA_ENABLED
from app.limiter import limiter
from app.version import __version__

from app.api import gsm, user_utils
from app.db_operations.activity import activity_tracking_middleware
from app.db_operations.auth import SessionDep
from app.api import auth, forgot_password, verify_email, peer_connection, ping, update_info, sync, profile_picture, gps, admin, public_chat, mikrotik, captive_portal, download

if IS_QA_ENABLED:
    from app.api import testing
from app.api import keys, wrapped_key, user_keys
from app.models.peer_key import PeerKey
from app.models.wrapped_key import WrappedKey
from app.models.wrapped_key_recovery import WrappedKeyRecovery
from app.models.recovery_session import RecoverySession
from app.models.email_recovery_token import EmailRecoveryToken
from app.models.login_attempt import LoginAttempt, RecoveryAttempt  # noqa: F401

import logging
from logging.handlers import RotatingFileHandler
from pythonjsonlogger import jsonlogger
import time
from app.db_operations.auth import SessionDep, engine
from app.db_operations.expire_announcements import expire_announcements_loop
from app.db_operations.router_metrics_collector import collect_metrics, collect_metrics_loop
from app.models.activity import ActivityLog
from app.db_operations.token import get_user_id_from_header


@asynccontextmanager
async def lifespan(app: FastAPI):
    import threading
    import redis.asyncio as aioredis
    from app.db_operations.connection_manager import manager

    # Schema is managed by Alembic migrations (server/alembic.ini), run as a
    # deploy step (see runserver.sh) before the app starts — not created here.

    # existing worker
    threading.Thread(
        target=collect_metrics_loop,
        daemon=True
    ).start()

    # NEW worker (announcement expiry)
    threading.Thread(
        target=expire_announcements_loop,
        daemon=True
    ).start()

    redis_client = aioredis.Redis.from_url(
        os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        decode_responses=True,
    )
    await manager.init(redis_client)

    yield

    await manager.shutdown()

app = FastAPI(
    title="SAPOT Server",
    description="A server that will mitigate the backend of the SAPOT mobile application",
    summary="A server that contains secure endpoint for the use of a mobile application",
    version=__version__,
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

_cors_origins = [origin.strip() for origin in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()]
if not _cors_origins:
    raise RuntimeError("CORS_ALLOWED_ORIGINS environment variable is not set")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.routing import Match

@app.middleware("http")
async def strip_trailing_slashes(request: Request, call_next):
    path = request.url.path
    if path != "/" and path.endswith("/"):
        path_without_trailing_slash = path.rstrip("/")

        # Check if the stripped path matches a route in the application
        redirect_scope = dict(request.scope)
        redirect_scope["path"] = path_without_trailing_slash

        for route in request.app.routes:
            match, _ = route.matches(redirect_scope)
            if match != Match.NONE:
                request.scope["path"] = path_without_trailing_slash
                if "raw_path" in request.scope:
                    request.scope["raw_path"] = path_without_trailing_slash.encode("utf-8")
                break

    return await call_next(request)


@app.middleware("http")
async def track_user_activity(request: Request, call_next):
    return await activity_tracking_middleware(request, call_next)

@app.get("/version")
def get_version():
    return {"version": __version__}


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


class UvicornWebSocket403Filter(logging.Filter):
    """Suppress uvicorn's own `"WebSocket ... " 403` access line.

    uvicorn logs this INFO-level line (on "uvicorn.error") for every
    WebSocket handshake that closes before being accepted — which includes
    routine, expected auth rejections (invalid/expired token). The route
    handlers intentionally leave those rejections silent, so this filter
    prevents them from surfacing as access-log noise (#326).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if record.name != "uvicorn.error":
            return True
        if "WebSocket" in record.msg and record.msg.rstrip().endswith("403"):
            return False
        return True


logging.getLogger("uvicorn.error").addFilter(UvicornWebSocket403Filter())

from uuid import UUID, uuid4
from sqlmodel import Session

_log_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="log-db")

_LOGGABLE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

def _write_activity_log_sync(user_id_str: str, action: str, metadata: dict) -> None:
    try:
        with Session(engine) as session:
            db_log = ActivityLog(
                user_id=UUID(user_id_str),
                action=action,
                entity_id=None,
                metadata_json=metadata,
            )
            session.add(db_log)
            session.commit()
    except Exception as e:
        print(f"[log_activity] db write failed: {e}")


@app.middleware("http")
async def log_activity(request: Request, call_next):
    current_user_id = get_user_id_from_header(request)

    start_time = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start_time) * 1000

    log_data = {
        "user_id": str(current_user_id) if current_user_id else "ANONYMOUS",
        "action": f"{request.method}_{request.url.path}",
        "entity_id": None,
        "metadata_json": {
            "status_code": response.status_code,
            "duration_ms": round(duration, 2),
            "ip": request.client.host if request.client else None,
        },
    }

    logger.info(f"Handled {request.url.path}", extra=log_data)

    # Only persist mutating requests to the DB to reduce write volume
    if current_user_id and request.method in _LOGGABLE_METHODS:
        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            _log_executor,
            _write_activity_log_sync,
            current_user_id,
            log_data["action"],
            log_data["metadata_json"],
        )

    return response


app.include_router(auth.router)
app.include_router(forgot_password.router)
app.include_router(keys.router)
app.include_router(wrapped_key.router)
app.include_router(user_keys.router)
app.include_router(verify_email.router)
app.include_router(peer_connection.router)
app.include_router(ping.router)
app.include_router(user_utils.router)
app.include_router(update_info.router)
app.include_router(sync.router)
app.include_router(profile_picture.router)
app.include_router(gps.router)
app.include_router(admin.router)
if IS_QA_ENABLED:
    app.include_router(testing.router)
app.include_router(public_chat.router)
app.include_router(gsm.router)
app.include_router(captive_portal.router)
app.include_router(mikrotik.router)
app.include_router(download.router)

STATIC_PATH = "static"
PROFILE_PICS_PATH = os.path.join(STATIC_PATH, "profile_pictures")

# 2. Create the folders if they don't exist
# exist_ok=True prevents an error if the folder is already there
os.makedirs(PROFILE_PICS_PATH, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return {"state": "running"}
