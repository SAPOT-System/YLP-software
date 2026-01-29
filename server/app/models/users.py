#!/usr/bin/env python3

from enum import unique
import uuid
from sqlmodel import SQLModel, Field


class UserBase(SQLModel):
    name: str = Field(index=True)
    phone_number: str = Field(unique=True)
    email: str = Field(unique=True)


class User(UserBase, table=True):
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        index=True,
        primary_key=True
    )
    hashed_password: str


class UserPublic(UserBase):
    id: uuid.UUID


class UserCreate(UserBase):
    id: uuid.UUID | None = None
    name: str
    phone_number: str
    email: str
    password: str
