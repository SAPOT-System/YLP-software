import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel


class DeviceKey(SQLModel, table=True):
    __tablename__ = "device_key"

    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    device_fingerprint: str = Field(index=True, max_length=64)
    public_key_b64: str = Field(max_length=64)
    bound_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen: datetime = Field(default_factory=datetime.utcnow)
