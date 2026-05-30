import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class WrappedKey(SQLModel, table=True):
    __tablename__ = "wrapped_key"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)
    wrapped_blob: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
