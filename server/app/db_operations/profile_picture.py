import os
import uuid
import shutil
from fastapi import UploadFile, HTTPException
from sqlmodel import Session, select
from app.models.user_profile_picture import UserProfilePicture

UPLOAD_DIR = "static/profile_pictures"

async def process_profile_upload(session: Session, user_id: uuid.UUID, file: UploadFile):
    # 1. Generate unique filename
    if not file.filename:
        raise Exception("invalid filename")
    file_ext = file.filename.split(".")[-1].lower()
    unique_filename = f"{user_id}_{uuid.uuid4().hex[:6]}.{file_ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    # 2. Save physical file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 3. Deactivate old pictures in DB
    # (Optional: You could also delete the physical files here if you don't want history)
    existing_pics = session.exec(
        select(UserProfilePicture).where(UserProfilePicture.user_id == user_id, UserProfilePicture.is_active == True)
    ).all()

    for pic in existing_pics:
        pic.is_active = False
        session.add(pic)

    # 4. Create new DB record
    new_pic = UserProfilePicture(
        filename=unique_filename,
        user_id=user_id,
        is_active=True
    )
    session.add(new_pic)
    session.commit()
    session.refresh(new_pic)

    return new_pic
