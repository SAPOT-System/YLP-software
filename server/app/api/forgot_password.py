#!/usr/bin/env python3

from fastapi import APIRouter, File, UploadFile
import hmac
import time
from fastapi.responses import StreamingResponse
from fastapi.responses import Response
import secrets
from typing import Annotated
import uuid
import io

from fastapi import Depends, FastAPI, HTTPException, Query
from sqlmodel import Field, Session, SQLModel, create_engine, select

from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import  OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
from pydantic import BaseModel
from starlette.status import HTTP_401_UNAUTHORIZED

from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash, update_user_password
from app.models.token import Token
from app.db_operations.token import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token
from app.models.users import User, UserCreate, UserPublic
from app.db_operations.token import get_current_user
from app.db_operations.forgot_password import generate_and_save_new_recovery_key, sign
from app.models.recovery import RecoveryKeyCreate
from app.db_operations.forgot_password import verify_recovery_key
from app.db_operations.auth import get_user
from app.models.users import UserPasswordUpdateNoOldPassword

LINK_TTL_SECONDS = 30 * 60  # 30 minutes

router = APIRouter(
    prefix='/auth/forgot-password',
    tags=['auth', 'forgot password'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.post('/generate-new-recovery-key')
def get_recovery_key(
        current_user : Annotated[User, Depends(get_current_user)],
        session : SessionDep,
):
    key_data = RecoveryKeyCreate(user=current_user)
    new_key = generate_and_save_new_recovery_key(session, key_data)
    return Response(
        content=new_key,
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=recovery-key.txt",
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )


@router.post('/recovery-with-recovery-key')
async def recover_with_recovery_key(
        user_identifier: str,
        session : SessionDep,
        key_file: UploadFile = File(...)
):
    current_user = get_user(user_identifier, session)

    if not current_user:
        raise HTTPException(status_code=400, detail="Invalid account identier.")

    if key_file.content_type not in ("text/plain", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    content = await key_file.read()

    key_text = content.decode("utf-8").strip()

    if len(key_text) < 20:
        raise HTTPException(status_code=400, detail="Recovery key is too short")


    if not verify_recovery_key(session, current_user, key_text):
        raise HTTPException(status_code=400, detail="Invalid key.")

    # give a signed link for password reset
    expires = int(time.time()) + LINK_TTL_SECONDS
    payload = f"{current_user.username}:{expires}"

    signature = sign(payload)
    return {
        'recovery-link': f'/auth/forgot-password/reset-password?expires={expires}&signature={signature}',
        'method': 'POST',
        'expire_in_seconds': LINK_TTL_SECONDS
    }

@router.get("/reset-password")
def can_reset_password(username: str, expires: int, signature: str):
    if time.time() > expires:
        raise HTTPException(status_code=403, detail="Link expired")

    payload = f"{username}:{expires}"
    expected_signature = sign(payload)

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")


    return {
        'detail': 'Valid signature. Use POST request.'
    }


@router.post("/reset-password")
def reset_password(username: str, new_password_data: UserPasswordUpdateNoOldPassword, expires: int, signature: str, session: SessionDep):
    if time.time() > expires:
        raise HTTPException(status_code=403, detail="Link expired")

    payload = f"{username}:{expires}"
    expected_signature = sign(payload)

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    user = get_user(username, session)

    if not user:
        raise HTTPException(status_code=404, detail="Invalid user data")



    update_user_password(user, new_password_data.new_password, session)

    return {
        "message": "password updated successfully."
    }
