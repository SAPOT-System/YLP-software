import uuid
from typing import Annotated
from fastapi import Depends, HTTPException, UploadFile
from fastapi.routing import APIRouter
import time

from sqlmodel import select

from app.db_operations.token import get_current_user
from app.models.users import User
from app.models.user_profile_picture import UserProfilePicture
from app.db_operations.auth import SessionDep
from app.db_operations.profile_picture import process_profile_upload


router = APIRouter(
    prefix='/profile-picture',
    tags=['profile picture'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.post("/me")
async def upload_photo(
    file: UploadFile,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)]
):
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, and WebP are allowed")

    photo_record = await process_profile_upload(session, current_user.id, file)

    return {
        "message": "Photo uploaded successfully",
        "photo_id": photo_record.id,
        "url": f"/static/profile_pics/{photo_record.filename}"
    }


@router.get("/me")
async def get_my_photo(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)]
):
    user_id = current_user.id
    statement = select(UserProfilePicture).where(
        UserProfilePicture.user_id == user_id,
        UserProfilePicture.is_active == True
    )
    photo = session.exec(statement).first()

    if not photo:
        return {"url": "/static/default.jpg"} # Fallback image

    return {"url": f"/static/profile_pictures/{photo.filename}"}

@router.get("/{user_id}")
async def get_user_photo(user_id: uuid.UUID, session: SessionDep):
    statement = select(UserProfilePicture).where(
        UserProfilePicture.user_id == user_id,
        UserProfilePicture.is_active == True
    )
    photo = session.exec(statement).first()

    if not photo:
        return {"url": "/static/default.jpg"} # Fallback image

    return {"url": f"/static/profile_pictures/{photo.filename}"}
