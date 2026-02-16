from typing import Annotated
from fastapi import Depends, HTTPException, Request
from pwdlib import PasswordHash
from sqlmodel import SQLModel, Session, create_engine, select

from app.models.users import User, UserCreate
from app.models.users import UserUpdate, UserPasswordUpdate



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

    if existing_email:
        errors["email"] = "Email already registered"

    # Check phone number
    existing_phone = session.exec(
        select(User).where(User.phone_number == user.phone_number)
    ).first()

    if existing_phone:
        errors["phone_number"] = "Phone number already registered"

    # If any errors exist → return them
    if errors:
        raise HTTPException(
            status_code=400,
            detail=errors
        )

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
