#!/usr/bin/env python3

import uuid
from datetime import datetime
from sqlmodel import Field, SQLModel

from app.models.users import User


class RecoveryKeyBase(SQLModel):
    user_id: uuid.UUID | None = Field(index=True, unique=True)
    key_hash: str = Field()
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class RecoveryKey(RecoveryKeyBase, table=True):
    id: uuid.UUID | None = Field(index=True, primary_key=True, default_factory=uuid.uuid4)

class RecoveryKeyCreate(SQLModel):
    user: User
