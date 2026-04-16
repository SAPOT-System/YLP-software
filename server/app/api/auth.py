from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash, update_user_password
from app.db_operations.token import get_current_user
from fastapi import APIRouter, BackgroundTasks, Request
from typing import Annotated, Literal
import uuid

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

from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash
from app.models.token import Token
from app.db_operations.token import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token, oauth2_scheme
from app.models.users import User, UserCreate, UserPublic
from app.models.email_verification import send_verification_email
from app.db_operations.token import generate_access_token, create_token_pair, logout, RefreshRequest, refresh_token
from app.db_operations.auth import get_user, verify_password


router = APIRouter(
    prefix='/auth',
    tags=['auth'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get('/')
def read_auth_status():
    return { 'status': 'auth endpoint is running properly' }



@router.post("/token", response_model=Token) # 1. Added response_model for validation
async def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
):
    # 2. authenticate_user should ideally return the User object
    user = authenticate_user(session, form_data.username, form_data.password)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # for banned users
    ban = user.banned
    if ban:
        ban.until = ban.until.replace(tzinfo=timezone.utc)
        is_banned = ban.until > datetime.now(timezone.utc)
        expiry_str = ban.until.strftime("%Y-%m-%d %H:%M UTC") if ban.until else "Permanently"
        if is_banned:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account banned until: {expiry_str}",
            )

    # 3. Ensure create_token_pair takes the user's UUID
    # We pass user.id to be used as the 'sub' claim
    tokens = create_token_pair(user.id)

    # 4. Return the full dictionary (access_token, refresh_token, token_type)
    return tokens


@router.post("/logout")
async def logout_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep
):
    return logout(token, session)

@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    request: RefreshRequest,
    session: SessionDep
):
    return refresh_token(request, session)

@router.post("/", response_model=UserPublic, status_code=201)
def create_account(user: UserCreate, session: SessionDep, background_tasks: BackgroundTasks, request: Request):
    sign_up_res = db_create_user(user, session)
    output = sign_up_res.model_dump()
    output['detail'] = 'Account created.'
    # output['token'] = generate_access_token(sign_up_res, ACCESS_TOKEN_EXPIRE_MINUTES).access_token
    tokens = create_token_pair(sign_up_res.id)
    output['access_token'] = tokens.access_token
    output['refresh_token'] = tokens.refresh_token
    return output


@router.get("/exists")
def exists(identifier: str, session: SessionDep):
    return {"exists" : bool(get_user(identifier, session))}


@router.post("/change-password")
def change_password(
        current_user : Annotated[User, Depends(get_current_user)],
        current_password: str,
        new_password: str,
        session: SessionDep
):
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(401, "Wrong old password")
    update_user_password(current_user, new_password, session)

    return {
        "message": "password updated successfully."
    }
