from uuid import UUID
from fastapi import HTTPException
from app.db_operations.auth import SessionDep
from app.models.users import User
from sqlmodel import select, Session
from fastapi.responses import JSONResponse

def search_case_insensitive(value: str, session: Session):
    statement = select(User).where(User.username.ilike(f"%{value}%"))
    results = session.exec(statement).all()

    return [
        user.model_dump(
            mode="json",
            include={"id", "username", "first_name", "last_name"}
        )
        for user in results
    ]

def search_by_id(value: UUID, session: SessionDep):
    statement = select(User).where(User.id == value)
    results = session.exec(statement).first()
    if not results:
        raise HTTPException(404, "user not found")
    return results.model_dump(
            mode="json",
            include={"id", "username", "first_name", "last_name"}
        )
