#!/usr/bin/env python3

import uuid
from sqlmodel import SQLModel, Field
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class TokenData(BaseModel):
    id: uuid.UUID | None



class PasswordResetToken(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID | None = Field(index=True)
    token_hash: str = Field(index=True, nullable=False, unique=True)
    expires_at: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
