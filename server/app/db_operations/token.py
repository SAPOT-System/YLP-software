#!/usr/bin/env python3
from app.models.token import Token
from typing import Annotated
from fastapi import Depends, HTTPException
from datetime import datetime, timedelta, timezone
from fastapi.security import  OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt import PyJWTError
from starlette.status import HTTP_401_UNAUTHORIZED

from app.db_operations.auth import SessionDep, get_user_by_email
from app.models.users import User
from app.models.token import TokenData
from app.models.users import UserCreate

SECRET_KEY = "7a272aa19fd88943207a62115b64f67530731eafd3b79a228f42972a2a51df1e"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return payload["sub"]  # user_id
    except PyJWTError:
        return None

def create_access_token(data: dict, expires_delta : timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=5)

    to_encode.update({"exp" : expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(
        token : Annotated[str, Depends(oauth2_scheme)],
        session: SessionDep
) -> User:
    credentials_exception = HTTPException(
        status_code=HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate" : "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ ALGORITHM ])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except jwt.InvalidTokenError:
        raise credentials_exception

    hero = get_user_by_email(email=email, session=session)

    if not hero:
        raise credentials_exception

    if hero is None:
        raise credentials_exception
    return hero


def generate_access_token(user: User|UserCreate, ACCESS_TOKEN_EXPIRE_MINUTES = 30):
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")
