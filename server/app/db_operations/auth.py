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
    validated_user = UserCreate.model_validate(user)
    hashed_password = get_password_hash(validated_user.password)
    pre_db_user = User(
        name=user.name,
        phone_number=user.phone_number,
        email=user.email,
        hashed_password=hashed_password
    )
    if user.id:
        pre_db_user.id = user.id

    db_user = User.model_validate(pre_db_user)
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


def get_user_by_email(session: SessionDep, email: str):
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user



def authenticate_user(
        session: SessionDep,
        secret_name: str,
        password: str
):
    hero = get_user_by_email(session, secret_name)
    if not hero:
        return False
    if not verify_password(password, hero.hashed_password):
        return False
    return hero
