from uuid import UUID
from fastapi import HTTPException
from app.db_operations.auth import SessionDep
from app.models.users import User
from sqlmodel import select, Session, func, or_
from fastapi.responses import JSONResponse

def search_case_insensitive(value: str, session: Session, limit: int, offset: int):
    search_val = f"%{value}%"

    statement = (
        select(User)
        .where(
            or_(
                # Search username
                User.username.ilike(search_val),
                # Search first_name independently
                User.first_name.ilike(search_val),
                # Search last_name independently
                User.last_name.ilike(search_val),
                # Search combined "First Last"
                (func.concat(User.first_name, " ", User.last_name)).ilike(search_val),
                # Search combined "Last First" (optional, for "Doe John" queries)
                (func.concat(User.last_name, " ", User.first_name)).ilike(search_val)
            )
        )
        .offset(offset)
        .limit(limit)
    )

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
