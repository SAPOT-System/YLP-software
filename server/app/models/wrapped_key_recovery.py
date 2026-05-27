import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, UniqueConstraint


class WrappedKeyRecovery(SQLModel, table=True):
    __tablename__ = "wrapped_key_recovery"
    __table_args__ = (UniqueConstraint("user_id", "method"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    method: str = Field(index=True)
    wrapped_blob: str
    recovery_metadata: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
