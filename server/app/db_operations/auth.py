import os
import logging
from datetime import datetime, timezone
from typing import Annotated, Dict
from uuid import UUID
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlmodel import SQLModel, Session, create_engine, select, or_

from app.models.users import User, UserCreate
from app.models.users import UserUpdate, UserPasswordUpdate
from app.structured_logging import log_context

logger = logging.getLogger("app")


# Reduced from recommended() defaults (time_cost=2, memory_cost=65536)
# to OWASP minimum — adequate for a LAN-only deployment where an attacker
# needs physical network access first. Raises safe login capacity ~6×.
password_hash = PasswordHash([Argon2Hasher(time_cost=1, memory_cost=19456, parallelism=1)])

SQLALCHEMY_DATABASE_URL = os.environ.get("DATABASE_URL")
if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")
sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
# engine = create_engine(sqlite_url, connect_args=connect_args)
#
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_recycle=1800,      # recycle before MySQL's default 8h wait_timeout
    pool_pre_ping=True,     # verify connection is alive before use
    pool_size=10,           # 4 workers × 2 middleware paths + 2 bg threads + headroom
    max_overflow=5,         # allow short bursts up to 15 total connections
    pool_timeout=10,        # fail fast instead of blocking indefinitely
)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session

SessionDep = Annotated[Session, Depends(get_session)]

def get_password_hash(password : str):
    return password_hash.hash(password)


def verify_password(plain_password : str, hashed__password : str):
    return password_hash.verify(plain_password, hashed__password)


def db_create_user(user: UserCreate, session: SessionDep, commit: bool = True):
    try:
        user_in_db = get_user_by_ID(session, user.id) if user.id else None
    except HTTPException:
        user_in_db = None
    except SQLAlchemyError:
        session.rollback()
        logger.exception(
            "Failed to look up existing user during user creation",
            extra=log_context(None, "user_creation_lookup_failed"),
        )
        raise HTTPException(500, "Internal server error.")
        
    errors: Dict[str, str] = {}

    # Single OR query instead of 3 sequential round-trips
    conditions = [User.username == user.username]
    if user.email:
        conditions.append(User.email == user.email)
    if user.phone_number:
        conditions.append(User.phone_number == user.phone_number)

    conflicts = session.exec(select(User).where(or_(*conditions))).all()
    for existing in conflicts:
        if existing.username == user.username:
            errors["username"] = "Username already taken"
        if user.email and existing.email == user.email:
            errors["email"] = "Email already registered"
        if user.phone_number and existing.phone_number == user.phone_number:
            errors["phone_number"] = "Phone number already registered"

    if errors:
        raise HTTPException(status_code=400, detail=errors)
    if not user_in_db:
        hashed_password = get_password_hash(user.password)
        db_user = User.model_validate(
            user,
            update={'hashed_password':hashed_password}
        )
        if hasattr(user, 'id') and user.id:
            db_user.id = user.id

        if user.terms_accepted:
            db_user.terms_accepted_at = datetime.now(timezone.utc)

        session.add(db_user)
        try:
            if commit:
                session.commit()
            else:
                session.flush()
        except IntegrityError:
            session.rollback()
            raise HTTPException(status_code=400, detail={"username": "Username or contact already registered"})
        if commit:
            session.refresh(db_user)
        return db_user
    elif user_in_db and user_in_db.guest:
        # modify existing user
        hashed_password = get_password_hash(user.password)
        db_user = User.model_validate(
            user,
            update={'hashed_password':hashed_password}
        )
        new_user_dump = db_user.model_dump(exclude_unset=True)
        
        for field, value in new_user_dump.items():
            setattr(user_in_db, field, value)

        if user.terms_accepted:
            user_in_db.terms_accepted_at = datetime.now(timezone.utc)

        session.add(user_in_db)
        # delete guest record
        session.delete(user_in_db.guest)
        if commit:
            session.commit()
            session.refresh(user_in_db)
        else:
            session.flush()
        return user_in_db
        # TODO: all guest accounts are disabled from getting a token in any way shape or form
        


def get_user_by_email(session: SessionDep, email: str):
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        # change to an appropriate error, not HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_user_by_username(session: SessionDep, username: str):
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        # change to an appropriate error, not HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user




def get_user_by_phone_number(session: SessionDep, phone_number: str):
    user = session.exec(select(User).where(User.phone_number == phone_number)).first()
    if not user:
        # change to an appropriate error, not HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_user_by_ID(session: SessionDep, ID: UUID):
    user = session.exec(select(User).where(User.id == ID)).first()
    if not user:
        # change to an appropriate error, not HTTPException
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_user(identifier: str | UUID, session: SessionDep):
    import uuid as _uuid
    conditions = [
        User.email == str(identifier),
        User.username == str(identifier),
        User.phone_number == str(identifier),
    ]
    try:
        uid = _uuid.UUID(str(identifier))
        conditions.append(User.id == uid)
    except (ValueError, AttributeError):
        pass

    return session.exec(select(User).where(or_(*conditions))).first()


def authenticate_user(
        session: SessionDep,
        identifier: str,
        password: str
):
    user = get_user(identifier, session)

    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user


def update_user_info(
    user: User, new_user_data: UserUpdate, session: SessionDep, commit: bool = True
):
    new_user_dump = new_user_data.model_dump(exclude_unset=True)

    for field, value in new_user_dump.items():
        setattr(user, field, value)

    session.add(user)
    if commit:
        session.commit()
        session.refresh(user)


PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def set_user_password(user: User, new_password: str, session: SessionDep):
    """Validate and stage a password replacement without committing it.

    Mirrors the rules UserCreate.password enforces at signup so a replacement
    password can never be weaker than the one it replaces.
    """
    v = new_password

    if not PASSWORD_MIN_LENGTH <= len(v) <= PASSWORD_MAX_LENGTH:
        raise ValueError(
            f"Password must be between {PASSWORD_MIN_LENGTH} and {PASSWORD_MAX_LENGTH} characters"
        )
    if not any(char.isdigit() for char in v):
        raise ValueError("Password must contain at least one number")
    if not any(char.islower() for char in v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(char.isupper() for char in v):
        raise ValueError("Password must contain at least one uppercase letter")

    hashed_password = get_password_hash(new_password)
    setattr(user, "hashed_password", hashed_password)
    session.add(user)


def update_user_password(user: User, new_password : str, session : SessionDep):
    set_user_password(user, new_password, session)
    session.commit()
    session.refresh(user)


def update_user_password_with_old_pass(user: User, password_update_data : UserPasswordUpdate, session : SessionDep):
    hashed_password = get_password_hash(password_update_data.new_password)
    setattr(user, "hashed_password", hashed_password)
    session.add(user)
    session.commit()
    session.refresh(user)


def get_domain(request: Request) -> str|None:
    domain = request.url.hostname
    return domain
