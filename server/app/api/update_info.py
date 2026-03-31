from typing import Annotated
from sqlalchemy import or_
from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
from app.db_operations.token import get_current_user

from app.models.users import UserUpdate, User
from app.db_operations.auth import update_user_info
from app.db_operations.auth import SessionDep

router = APIRouter(
    prefix='/update/profile',
    tags=['update', 'profile'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.post("/")
def update_user(
    current_user: Annotated[User, Depends(get_current_user)],
    new_user_data: UserUpdate,
    session: SessionDep
):
    existing = session.query(User).filter(
        or_(
            User.username == new_user_data.username,
            User.email == new_user_data.email,
            User.phone_number == new_user_data.phone_number,
        )
    ).first()

    if existing and existing.id != current_user.id:
        raise HTTPException(409, "Username, email, or phone number already taken")

    try:
        update_user_info(current_user, new_user_data, session)
        session.commit()
    except Exception:
        session.rollback()
        raise HTTPException(500, "Server error")

    return {
        "status": "ok"
    }
