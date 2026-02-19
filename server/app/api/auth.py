#!/usr/bin/env python3

from fastapi import APIRouter, BackgroundTasks, Request
from typing import Annotated
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
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


@router.post("/", response_model=UserPublic, status_code=201)
def create_account(user: UserCreate, session: SessionDep, background_tasks: BackgroundTasks, request: Request):
    sign_up_res = db_create_user(user, session)
    output = sign_up_res.model_dump()
    output['detail'] = 'Account created. Check email to verify'
    send_verification_email(sign_up_res.id, session, background_tasks, request)

    return output
