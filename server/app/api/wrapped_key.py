import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.token import get_current_user
from app.limiter import limiter
from app.models.users import User
from app.models.wrapped_key import WrappedKey

router = APIRouter(
    prefix="/users",
    tags=["users", "key wrapping"],
    responses={404: {"description": "Not Found"}},
)


class WrappedKeyRequest(BaseModel):
    wrapped_blob: str


@router.post("/wrapped-key", status_code=201)
@limiter.limit("3/minute")
def store_wrapped_key(
    request: Request,
    body: WrappedKeyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    existing = session.exec(select(WrappedKey).where(WrappedKey.user_id == current_user.id)).first()
    if existing:
        session.delete(existing)
        session.commit()
    wk = WrappedKey(user_id=current_user.id, wrapped_blob=body.wrapped_blob)
    session.add(wk)
    session.commit()
    return {"message": "Wrapped key stored."}


@router.get("/wrapped-key")
@limiter.limit("10/minute")
def get_wrapped_key(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    wk = session.exec(select(WrappedKey).where(WrappedKey.user_id == current_user.id)).first()
    if not wk:
        raise HTTPException(status_code=404, detail="No wrapped key found")
    return {"wrapped_blob": wk.wrapped_blob, "created_at": wk.created_at.isoformat()}


@router.put("/wrapped-key")
@limiter.limit("5/minute")
def update_wrapped_key(
    request: Request,
    body: WrappedKeyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    wk = session.exec(select(WrappedKey).where(WrappedKey.user_id == current_user.id)).first()
    if not wk:
        raise HTTPException(status_code=404, detail="No wrapped key found")
    wk.wrapped_blob = body.wrapped_blob
    wk.updated_at = datetime.utcnow()
    session.add(wk)
    session.commit()
    return {"message": "Wrapped key updated."}
