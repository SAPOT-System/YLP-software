from contextlib import asynccontextmanager
from typing import Union

from fastapi import FastAPI
from starlette.responses import JSONResponse

from app.api import user_utils
from app.db_operations.auth import create_db_and_tables
from app.api import auth, forgot_password, verify_email, peer_connection, ping, update_info, sync

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

app.include_router(auth.router)
app.include_router(forgot_password.router)
app.include_router(verify_email.router)
app.include_router(peer_connection.router)
app.include_router(ping.router)
app.include_router(user_utils.router)
app.include_router(update_info.router)
app.include_router(sync.router)

@app.get("/")
def read_root():
    return {"state": "running"}
