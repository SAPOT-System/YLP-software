from typing import Annotated
from fastapi import Depends, HTTPException
from pwdlib import PasswordHash
from sqlmodel import SQLModel, Session, create_engine, select

from app.models.users import User, UserCreate



password_hash = PasswordHash.recommended()


sqlite_file_name = "database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)


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
    hashed_password = get_password_hash(user.password)
    db_user = User.model_validate(
        user,
        update={'hashed_password':hashed_password}
    )
    if hasattr(user, 'id') and user.id:
        db_user.id = user.id

    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(session: SessionDep, email: str):
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_user_by_username(session: SessionDep, username: str):
    user = session.exec(select(User).where(User.username == username)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user




def get_user_by_phone_number(session: SessionDep, phone_number: str):
    user = session.exec(select(User).where(User.phone_number == phone_number)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user



def authenticate_user(
        session: SessionDep,
        identifier: str,
        password: str
):
    methods = [get_user_by_email, get_user_by_username, get_user_by_phone_number]

    hero = None

    for method in methods:
        try:
            hero = method(session, identifier)
        except:
            continue

    if not hero:
        return False
    if not verify_password(password, hero.hashed_password):
        return False
    return hero


def update_user_info(user: User, new_user_data : UserUpdate, session : SessionDep):
    new_user_dump = new_user_data.model_dump(exclude_unset=True)

    for field, value in new_user_dump.items():
        setattr(user, field, value)

    session.add(user)
    session.commit()
    session.refresh(user)
