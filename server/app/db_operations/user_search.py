from uuid import UUID
from fastapi import HTTPException
from app.db_operations.auth import SessionDep
from app.models.users import User
from app.models.activity import UserActivity
from sqlmodel import select, Session, func, or_
from fastapi.responses import JSONResponse

def search_case_insensitive(
    value: str,
    session: Session,
    limit: int = 20,
    offset: int = 0,
):
    value = value.strip()

    if not value:
        return []

    search_val = f"%{value}%"

    full_name = User.first_name + " " + User.last_name
    reverse_full_name = User.last_name + " " + User.first_name

    statement = (
            select(User)
            .where(
                User.guest == None  # exclude guests
                )
            .where(
                or_(
                    User.username.ilike(search_val),
                    User.first_name.ilike(search_val),
                    User.last_name.ilike(search_val),
                    full_name.ilike(search_val),
                    reverse_full_name.ilike(search_val),
                    )
                )
            .offset(offset)
            .limit(limit)
            )

    users = session.exec(statement).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone_is_verified": len(user.phone_is_verified) > 0,
            "role": _resolve_role(user),
        }
        for user in users
    ]

def search_by_id(value: UUID, session: SessionDep):
    statement = select(User).where(User.id == value)
    results = session.exec(statement).first()
    if not results:
        raise HTTPException(404, "user not found")

    activity = session.exec(
        select(UserActivity).where(UserActivity.user_id == value)
    ).first()
    last_active = (
        activity.last_active.isoformat() + "Z" if activity and activity.last_active else None
    )

    return {
        **results.model_dump(
            mode="json",
            include={"id", "username", "first_name", "last_name"}
        ),
        "phone_is_verified": len(results.phone_is_verified) > 0,
        "role": _resolve_role(results),
        "last_active": last_active,
        "status": activity.status if activity else "Inactive",
    }

def _resolve_role(user: User) -> str:
    if user.admin is not None:
        return "admin"
    if user.rescuer is not None:
        return "rescuer"
    return "user"
