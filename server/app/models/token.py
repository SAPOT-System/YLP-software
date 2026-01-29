#!/usr/bin/env python3

import uuid
from sqlmodel import SQLModel, Field
from pydantic import BaseModel


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    id: uuid.UUID | None
