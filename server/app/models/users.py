#!/usr/bin/env python3

from enum import unique
from typing import Annotated
import uuid
from pydantic import EmailStr, StringConstraints, field_validator
from sqlmodel import SQLModel, Field

PhoneStr = Annotated[
    str,
    StringConstraints(pattern=r"^\+?1?\d{9,15}$")
]

class UserBase(SQLModel):
    username: str | None = Field(index=True, max_length=16, min_length=2, unique=True, default=None)
    first_name: str = Field(index=True, max_length=25, min_length=2)
    last_name: str = Field(index=True, max_length=25, min_length=2)
    phone_number: PhoneStr | None = Field(unique=True, default=None)
    email: EmailStr = Field(unique=True)

    # @property
    # def username(self) -> str | None:
    #     return self.name

    # @username.setter
    # def username(self, value: str|None):
    #     self.name = value


class User(UserBase, table=True):
    id: uuid.UUID | None = Field(
        default_factory=uuid.uuid4,
        index=True,
        primary_key=True
    )
    hashed_password: str


class UserPublic(UserBase):
    id: uuid.UUID


class UserCreate(UserBase):
    id: uuid.UUID | None = None
    username: str | None = None
    first_name: str
    last_name: str
    phone_number: PhoneStr | None = None
    email: EmailStr
    password: str = Field(min_length=8)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str):
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one number")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v
