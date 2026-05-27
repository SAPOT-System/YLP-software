import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class RecoverySession(SQLModel, table=True):
    __tablename__ = "recovery_session"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    token_hash: str = Field(index=True, unique=True)
    method: str
    expires_at: datetime
    used: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
