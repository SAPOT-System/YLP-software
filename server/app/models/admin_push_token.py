import datetime
import uuid

from sqlmodel import Field, SQLModel


class AdminPushToken(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    admin_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    token: str = Field(unique=True, index=True)
    platform: str

    created_at: datetime.datetime = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    last_seen: datetime.datetime = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
