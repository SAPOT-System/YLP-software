import datetime
from typing import Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

class DeviceBase(SQLModel):
    public_key: str
    created_at: datetime.datetime
    last_online: datetime.datetime


class Device(DeviceBase, table=True):
    id: uuid.UUID | None = Field(index=True, unique=True)
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")

    user: Optional['User'] = Relationship(back_populates="devices")
