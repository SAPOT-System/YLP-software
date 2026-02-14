from contextlib import asynccontextmanager
from typing import Union

from fastapi import FastAPI
from starlette.responses import JSONResponse

from app.db_operations.auth import create_db_and_tables
from app.api import auth, forgot_password

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

@app.get("/")
def read_root():
    return {"state": "running"}
