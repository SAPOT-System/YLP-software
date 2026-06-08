import uuid
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.token import get_current_user
from app.db_operations.wrapped_key_recovery import (
    bulk_upsert_recovery_blobs,
    create_recovery_session,
    get_recovery_blob,
    validate_recovery_session,
)
from app.limiter import limiter
from app.models.users import User

router = APIRouter(
    prefix="/users",
    tags=["users", "key recovery"],
    responses={404: {"description": "Not Found"}},
)


class RecoveryBlobItem(BaseModel):
    method: str
    wrapped_blob: str
    metadata: str | None = None


class RecoverySetupRequest(BaseModel):
    blobs: list[RecoveryBlobItem]


@router.post("/recovery-setup", status_code=201)
@limiter.limit("3/minute")
def setup_recovery_keys(
    request: Request,
    body: RecoverySetupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    bulk_upsert_recovery_blobs(
        session,
        current_user.id,
        [b.model_dump() for b in body.blobs],
    )
    return {"message": "Recovery methods configured."}


@router.get("/recovery-key")
@limiter.limit("5/minute")
def get_recovery_key(
    request: Request,
    recovery_token: str,
    method: str,
    session: SessionDep,
):
    rec = validate_recovery_session(session, recovery_token)
    blob = get_recovery_blob(session, rec.user_id, method)
    if not blob:
        raise HTTPException(status_code=404, detail="No recovery blob found for this method")
    return {
        "wrapped_blob": blob.wrapped_blob,
        "metadata": blob.recovery_metadata,
        "user_id": str(rec.user_id),
    }


@router.put("/recovery-keys")
@limiter.limit("5/minute")
def update_recovery_keys(
    request: Request,
    body: RecoverySetupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    bulk_upsert_recovery_blobs(
        session,
        current_user.id,
        [b.model_dump() for b in body.blobs],
    )
    return {"message": "Recovery keys updated."}
