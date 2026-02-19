#!/usr/bin/env python3

from enum import unique
from typing import Annotated, List
import uuid
from pydantic import EmailStr, StringConstraints, field_validator, Field as PyField
from sqlmodel import SQLModel, Field, Relationship
from .securityQuestions import UserSecurityQuestion

PhoneStr = Annotated[
    str,
    StringConstraints(pattern=r"^\+?1?\d{9,15}$")
]

class UserBase(SQLModel):
    username: str = Field(index=True, max_length=50, min_length=2, unique=True)
    first_name: str = Field(index=True, max_length=50, min_length=2)
    last_name: str = Field(index=True, max_length=50, min_length=2)
    phone_number: PhoneStr = Field(unique=True)
    email: EmailStr = Field(unique=True)


class User(UserBase, table=True):
    id: uuid.UUID | None = Field(
        default_factory=uuid.uuid4,
        index=True,
        primary_key=True
    )
    hashed_password: str
    email_verified : bool =  Field(default=False)

    security_questions: List["UserSecurityQuestion"] = Relationship(back_populates="user")


    email_verifications: List["EmailVerification"] = Relationship(
        back_populates="user"
    )


class UserPublic(UserBase):
    id: uuid.UUID
    detail: str


class UserCreate(UserBase):
    id: uuid.UUID | None = PyField(
        default=None,
        description="Optional unique identifier for the user. "
                    "If not provided, it will be generated automatically.",
        examples=["550e8400-e29b-41d4-a716-446655440000"]
    )

    username: str = PyField(
        min_length=2,
        max_length=50,
        description="Unique username used for login and identification. "
                    "Must be between 2 and 50 characters.",
        examples=["johndoe"]
    )

    first_name: str = PyField(
        min_length=2,
        max_length=50,
        description="User's first name. Must be between 2 and 50 characters.",
        examples=["John"]
    )

    last_name: str = PyField(
        min_length=2,
        max_length=50,
        description="User's last name. Must be between 2 and 50 characters.",
        examples=["Doe"]
    )

    phone_number: PhoneStr = PyField(
        description="User's phone number in international format (E.164 recommended).",
        examples=["+14155552671"]
    )

    email: EmailStr = PyField(
        description="Valid email address used for account communication and login.",
        examples=["john.doe@example.com"]
    )

    password: str = PyField(
        min_length=8,
        max_length=128,
        description=(
            "Password must be 8–128 characters long and include at least "
            "one uppercase letter, one lowercase letter, and one number."
        ),
        examples=["StrongPass123"]
    )

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

class UserUpdate(SQLModel):
    username: str | None = Field(
        default=None, max_length=255, min_length=2
    )
    first_name: str | None = Field(
        default=None, max_length=25, min_length=2
    )
    last_name: str | None = Field(
        default=None, max_length=25, min_length=2
    )
    phone_number: PhoneStr | None = Field(default=None)
    email: EmailStr | None = Field(default=None)



class UserPasswordUpdate(SQLModel):
    current_password: str
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str):
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one number")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class UserPasswordUpdateNoOldPassword(SQLModel):
    new_password: str = Field(min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_complexity(cls, v: str):
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one number")
        if not any(char.islower() for char in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v
