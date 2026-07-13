import uuid
from datetime import datetime, timezone

from sqlmodel import SQLModel, Field


class FcmDeviceToken(SQLModel, table=True):
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
    )
    # Many device tokens may belong to one admin (fan-out to all devices),
    # so user_id is indexed but NOT unique. The token itself is unique.
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    token: str = Field(index=True, unique=True)
    platform: str = Field(default="android")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class FcmTokenCreate(SQLModel):
    """Request body schema for POST /admin/device-token."""

    token: str = Field(min_length=1)
    platform: str = "android"
