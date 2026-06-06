#!/usr/bin/env python3
from uuid import UUID, uuid4
from pydantic import BaseModel
from sqlmodel import Session, select
from app.models.token import Token
from typing import Annotated
from fastapi import Depends, HTTPException, status, Request
from datetime import datetime, timedelta, timezone
from fastapi.security import  OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt import PyJWTError
from starlette.status import HTTP_401_UNAUTHORIZED

from app.db_operations.auth import SessionDep, get_user_by_email
from app.models.users import User
from app.models.token import TokenData
from app.models.users import UserCreate
from app.models.jti import BlacklistedToken
from app.db_operations.auth import get_user, get_user_by_ID

SECRET_KEY = "7a272aa19fd88943207a62115b64f67530731eafd3b79a228f42972a2a51df1e"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_ACCESS_TOKEN_EXPIRE_DAYS = 60
REAUTH_TOKEN_EXPIRE_MINUTES = 10


def create_reauth_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=REAUTH_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "type": "reauth", "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_reauth_token(request: Request) -> None:
    """Raise HTTP 401 if the X-Reauth-Token header is missing or invalid."""
    token = request.headers.get("X-Reauth-Token")
    if not token:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Password confirmation required",
        )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("type") != "reauth":
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
    except PyJWTError:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Reauth token is invalid or expired",
        )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def get_user_id_from_header(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    
    try:
        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub") # or payload.get("user_id")
    except Exception:
        return None

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
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep
) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")

        # Validation Logic
        if user_id is None or jti is None or token_type != "access":
            raise credentials_exception

        # Check SQLite Blacklist
        if is_token_blacklisted(session, jti):
            raise HTTPException(status_code=401, detail="Token has been revoked")

    except jwt.PyJWTError:
        raise credentials_exception

    user = get_user_by_ID(session, UUID(user_id))
    if not user:
        raise credentials_exception

    return user


async def get_current_user_rescuer(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep
) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")

        # Validation Logic
        if user_id is None or jti is None or token_type != "access":
            raise credentials_exception

        # Check SQLite Blacklist
        if is_token_blacklisted(session, jti):
            raise HTTPException(status_code=401, detail="Token has been revoked")

    except jwt.PyJWTError:
        raise credentials_exception

    user = get_user_by_ID(session, UUID(user_id))
    if not user:
        raise credentials_exception

    if not user.rescuer and not user.admin:
        raise credentials_exception

    return user


async def get_current_user_admin(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep
) -> User:
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")

        # Validation Logic
        if user_id is None or jti is None or token_type != "access":
            raise credentials_exception

        # Check SQLite Blacklist
        if is_token_blacklisted(session, jti):
            raise HTTPException(status_code=401, detail="Token has been revoked")

    except jwt.PyJWTError:
        raise credentials_exception

    user = get_user_by_ID(session, UUID(user_id))
    if not user:
        raise credentials_exception

    if not user.admin:
        raise credentials_exception

    return user

# depreciated function, used create_token_pair instead
def generate_access_token(user: User|UserCreate, ACCESS_TOKEN_EXPIRE_MINUTES = 30):
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    if not user.id:
        raise Exception("user has no ID")
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )
    return Token(access_token=access_token, token_type="bearer")


def create_token_pair(user_id: UUID) -> Token:
    now = datetime.now(timezone.utc)

    # Generate unique UUIDs for each token's JTI
    access_jti = uuid4()
    refresh_jti = uuid4()

    # Access Token Payload
    access_payload = {
        "sub": str(user_id),
        "jti": str(access_jti), # JWT standard expects strings for claims
        "type": "access",
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }

    # Refresh Token Payload
    refresh_payload = {
        "sub": str(user_id),
        "jti": str(refresh_jti),
        "type": "refresh",
        "exp": now + timedelta(minutes=REFRESH_ACCESS_TOKEN_EXPIRE_DAYS)
    }

    res = Token(
        access_token=jwt.encode(access_payload, SECRET_KEY, algorithm=ALGORITHM),
        refresh_token=jwt.encode(refresh_payload, SECRET_KEY, algorithm=ALGORITHM),
        token_type="bearer"
    )

    print(res)

    return res

def is_token_blacklisted(session: SessionDep, jti_str: str) -> bool:
    try:
        # Convert the string from the JWT back into a UUID object for the DB query
        jti_uuid = UUID(jti_str)
        statement = select(BlacklistedToken).where(BlacklistedToken.jti == jti_uuid)
        return session.exec(statement).first() is not None
    except (ValueError, AttributeError):
        return True # If JTI is mangled, treat it as invalid/blacklisted


def add_to_blacklist(session: SessionDep, jti_str: str, expires_at: datetime):
    """
    Persists a revoked JTI to SQLite.
    """
    # Convert string JTI from JWT back to UUID object for SQLite
    jti_uuid = UUID(jti_str)

    blacklisted_token = BlacklistedToken(
        jti=jti_uuid,
        expires_at=expires_at
    )
    session.add(blacklisted_token)
    session.commit()

def logout(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: SessionDep
):
    try:
        # 1. Decode the token (without verifying expiration so we can blacklist expired-ish tokens)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        jti = payload.get("jti")
        exp = payload.get("exp")

        if not jti or not exp:
            raise HTTPException(status_code=400, detail="Invalid token payload")

        # 2. Convert the 'exp' timestamp from the JWT to a datetime object
        # This tells SQLite how long to keep this JTI in the "naughty list"
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)

        # 3. Add to the blacklist
        add_to_blacklist(session, jti, expires_at)

        return {"message": "Successfully logged out and token invalidated"}

    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


class RefreshRequest(BaseModel):
    refresh_token: str

def refresh_token(
    request: RefreshRequest,
    session: SessionDep
):
    credentials_exception = HTTPException(
        status_code=HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # 1. Decode the Refresh Token
        payload = jwt.decode(request.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        jti: str = payload.get("jti")
        token_type: str = payload.get("type")
        exp: int = payload.get("exp")

        # 2. Validation: Must be a 'refresh' token
        if token_type != "refresh" or user_id is None or jti is None:
            raise credentials_exception

        # 3. Check SQLite: Has this refresh token been blacklisted/already used?
        if is_token_blacklisted(session, jti):
            # SECURITY ALERT: If a blacklisted refresh token is used again,
            # it might mean a stolen token is being replayed.
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked or already used"
            )

        # 4. Blacklist the USED refresh token (Rotation)
        # We convert the exp timestamp to a datetime for SQLite
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc)
        add_to_blacklist(session, jti, expires_at)

        # 5. Generate a brand new pair for the user
        return create_token_pair(UUID(user_id))

    except jwt.PyJWTError:
        raise credentials_exception
