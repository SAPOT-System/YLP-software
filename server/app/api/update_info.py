from typing import Annotated
from sqlalchemy import or_
from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
from app.db_operations.token import get_current_user

from app.models.users import UserUpdate, User
from app.db_operations.auth import update_user_info
from app.db_operations.auth import SessionDep

from sqlalchemy.exc import IntegrityError
from fastapi import status

router = APIRouter(
    prefix='/update/profile',
    tags=['update', 'profile'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.post("/", status_code=status.HTTP_200_OK)
def update_user(
    current_user: Annotated[User, Depends(get_current_user)],
    new_user_data: UserUpdate,
    session: SessionDep
):
    check_fields = []
    if new_user_data.username and new_user_data.username != current_user.username:
        check_fields.append(User.username == new_user_data.username)
    if new_user_data.email and new_user_data.email != current_user.email:
        check_fields.append(User.email == new_user_data.email)
    if new_user_data.phone_number and new_user_data.phone_number != current_user.phone_number:
        check_fields.append(User.phone_number == new_user_data.phone_number)

    if check_fields:
        existing = session.query(User).filter(or_(*check_fields)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail="Username, email, or phone number already taken"
            )

    try:
        update_data = new_user_data.model_dump(exclude_unset=True)
        
        for key, value in update_data.items():
            if hasattr(current_user, key):
                setattr(current_user, key, value)
        
        session.add(current_user)
        session.commit()
        session.refresh(current_user)

    except IntegrityError as e:
        session.rollback()
        error_msg = str(e).lower()
        if "username" in error_msg:
            detail = "Username is already taken"
        elif "email" in error_msg:
            detail = "Email is already registered"
        elif "phone" in error_msg:
            detail = "Phone number is already registered"
        else:
            detail = "Conflict with existing user data"
            
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="An unexpected error occurred"
        )

    return {"status": "ok" }
