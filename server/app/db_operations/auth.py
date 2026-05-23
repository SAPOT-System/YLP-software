from datetime import datetime, timezone
from typing import Annotated, Dict
from uuid import UUID
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlmodel import SQLModel, Session, create_engine, select

from app.models.users import User, UserCreate
from app.models.users import UserUpdate, UserPasswordUpdate



password_hash = PasswordHash.recommended()

SQLALCHEMY_DATABASE_URL = "mysql+pymysql://sapot:sapot@127.0.0.1:3306/sapot_db"
sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
# engine = create_engine(sqlite_url, connect_args=connect_args)
#
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # pool_recycle helps prevent "MySQL server has gone away" errors
    pool_recycle=3600 
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


def db_create_user(user: UserCreate, session: SessionDep):
    try:
        user_in_db = get_user_by_ID(session, user.id) if user.id else None
    except HTTPException:
        user_in_db = None
    except:
        raise HTTPException(500, "Internal server error.")
        
    errors: Dict[str, str] = {}

    # Check username
    existing_username = session.exec(
        select(User).where(User.username == user.username)
    ).first()

    if existing_username:
        errors["username"] = "Username already taken"
        
    # Check email
    existing_email = session.exec(
        select(User).where(User.email == user.email)
    ).first()

    if existing_email and user.email :
        errors["email"] = "Email already registered"

    # Check phone number
    existing_phone = session.exec(
        select(User).where(User.phone_number == user.phone_number)
    ).first()

    if existing_phone and user.phone_number:
        errors["phone_number"] = "Phone number already registered"

    # If any errors exist → return them
    if errors:
        raise HTTPException(
            status_code=400,
            detail=errors
        )
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
        session.commit()
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
        session.commit()
        session.refresh(user_in_db)
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


def get_user(identifier: str|UUID, session: SessionDep):
    methods = [get_user_by_email, get_user_by_username, get_user_by_phone_number, get_user_by_ID]

    user = None

    for method in methods:
        try:
            user = method(session, identifier)
        except:
            continue

    if not user:
        return None

    return user


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


def update_user_info(user: User, new_user_data : UserUpdate, session : SessionDep):
    new_user_dump = new_user_data.model_dump(exclude_unset=True)

    for field, value in new_user_dump.items():
        setattr(user, field, value)

    session.add(user)
    session.commit()
    session.refresh(user)


def update_user_password(user: User, new_password : str, session : SessionDep):
    v = new_password

    if not any(char.isdigit() for char in v):
        raise ValueError("Password must contain at least one number")
    if not any(char.islower() for char in v):
        raise ValueError("Password must contain at least one lowercase letter")
    if not any(char.isupper() for char in v):
        raise ValueError("Password must contain at least one uppercase letter")

    hashed_password = get_password_hash(new_password)
    setattr(user, "hashed_password", hashed_password)
    session.add(user)
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
