import os
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles
from typing import Union

from fastapi import FastAPI
from fastapi import Request
from starlette.responses import JSONResponse

from app.api import user_utils
from app.db_operations.activity import activity_tracking_middleware
from app.db_operations.auth import SessionDep, create_db_and_tables
from app.api import auth, forgot_password, verify_email, peer_connection, ping, update_info, sync, profile_picture, gps, admin, testing

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(
    title="SAPOT Server",
    description="A server that will mitigate the backend of the SAPOT mobile application",
    summary="A server that contains secure endpoint for the use of a mobile application",
    version="0.0.1",
    lifespan=lifespan
)

@app.middleware("http")
async def track_user_activity(request: Request, call_next):
    return await activity_tracking_middleware(request, call_next)

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

STATIC_PATH = "static"
PROFILE_PICS_PATH = os.path.join(STATIC_PATH, "profile_pictures")

# 2. Create the folders if they don't exist
# exist_ok=True prevents an error if the folder is already there
os.makedirs(PROFILE_PICS_PATH, exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def read_root():
    return {"state": "running"}
