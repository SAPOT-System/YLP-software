import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class LoginAttempt(SQLModel, table=True):
    __tablename__ = "login_attempt"

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    device_fingerprint: str = Field(index=True, max_length=64)
    device_type: str = Field(max_length=20)
    attempt_count: int = Field(default=0)
    lockout_count: int = Field(default=0)
    locked_until: Optional[datetime] = Field(default=None, nullable=True)
    last_attempt_at: Optional[datetime] = Field(default=None, nullable=True)


class RecoveryAttempt(SQLModel, table=True):
    __tablename__ = "recovery_attempt"

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    device_fingerprint: str = Field(index=True, max_length=64)
    recovery_method: str = Field(index=True, max_length=30)
    device_type: str = Field(max_length=20)
    attempt_count: int = Field(default=0)
    lockout_count: int = Field(default=0)
    locked_until: Optional[datetime] = Field(default=None, nullable=True)
    last_attempt_at: Optional[datetime] = Field(default=None, nullable=True)
