import uuid
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Relationship
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.users import User

class UserProfilePicture(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    filename: str = Field(index=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True) # Useful if you want to keep history

    # Relationship to User
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    user: "User" = Relationship(back_populates="profile_picture")
