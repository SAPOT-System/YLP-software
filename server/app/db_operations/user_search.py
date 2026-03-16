from app.models.users import User
from sqlmodel import select, Session
from sqlalchemy import or_
from fastapi.responses import JSONResponse

def search_case_insensitive(value: str, session: Session):
    statement = select(User).where(
        or_(User.username.ilike(f"%{value}%"),
            User.first_name.ilike(f"%{value}%"),
            User.last_name.ilike(f"%{value}%"))
    )
    results = session.exec(statement).all()

    return [
        user.model_dump(
            mode="json",
            include={"id", "username", "first_name", "last_name"}
        )
        for user in results
    ]
