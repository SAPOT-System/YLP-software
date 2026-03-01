#!/usr/bin/env python3

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
from app.db_operations.token import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token
from app.models.users import User, UserCreate, UserPublic
from app.models.email_verification import send_verification_email
from app.db_operations.token import generate_access_token
from app.db_operations.auth import get_user


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



@router.post("/token")
async def login_for_access_token(
        form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
        session: SessionDep,
) -> Token:
    user = authenticate_user(session, form_data.username, form_data.password)

    if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username, phone number, email address or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return generate_access_token(user, ACCESS_TOKEN_EXPIRE_MINUTES)



@router.post("/", response_model=UserPublic, status_code=201)
def create_account(user: UserCreate, session: SessionDep, background_tasks: BackgroundTasks, request: Request):
    sign_up_res = db_create_user(user, session)
    output = sign_up_res.model_dump()
    output['detail'] = 'Account created.'
    # output login token here
    output['token'] = generate_access_token(user).access_token
    return output


@router.get("/exists")
def exists(identifier: str, session: SessionDep):
    return {"exists" : bool(get_user(identifier, session))}
