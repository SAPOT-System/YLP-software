from datetime import datetime
from enum import unique
from typing import Annotated, List, Optional
import uuid
from pydantic import EmailStr, StringConstraints, field_validator, Field as PyField
from sqlmodel import SQLModel, Field, Relationship
from .securityQuestions import UserSecurityQuestion

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.conversation import ConversationParticipant
    from app.models.call import Call
    from app.models.call_participant import CallParticipant
    from app.models.message import Message
    from app.models.user_profile_picture import UserProfilePicture
    from app.models.message_receipt import MessageReceipt
    from app.models.location import UserLocation
    from app.models.rescuer import Rescuer
    from app.models.admin import Admin
    from app.models.activity import UserActivity, ActivityLog
    from app.models.banned_user import BannedUser
    from app.models.guest import Guest
    from app.models.announcement import Announcement
    from app.models.phone_verification import PhoneVerification, PhoneVerified
    # from app.models.email_verification import EmailVerification


PhoneStr = Annotated[
    str,
    StringConstraints(
        pattern=r"^\+639\d{9}$"
    )
]

class UserBase(SQLModel):
    username: str = Field(index=True, max_length=50, min_length=2, unique=True)
    first_name: str = Field(index=True, max_length=50, min_length=2)
    last_name: str = Field(index=True, max_length=50, min_length=2)
    phone_number: PhoneStr | None  = Field(unique=True, default=None)
    email: EmailStr | None = Field(unique=True, default=None)


class User(UserBase, table=True):
    id: uuid.UUID | None = Field(
        default_factory=uuid.uuid4,
        index=True,
        primary_key=True
    )
    hashed_password: str
    email_verified : bool =  Field(default=False)
    terms_accepted_at: datetime | None = Field(default=None, nullable=True)

    security_questions: List["UserSecurityQuestion"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    activity: Optional["UserActivity"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    conversation_participants: List["ConversationParticipant"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    messages: List["Message"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    calls: List["Call"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    callparticipants: List["CallParticipant"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    email_verifications: List["EmailVerification"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    messagereceipts: List["MessageReceipt"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    profile_picture: Optional["UserProfilePicture"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={
                "cascade": "all, delete-orphan", # The magic string
                }
            )

    locations: list["UserLocation"] = Relationship(
            back_populates="user",
            sa_relationship_kwargs={"cascade": "all, delete-orphan"}
            )

    rescuer: Optional["Rescuer"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    admin: Optional["Admin"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    banned: Optional["BannedUser"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    guest: Optional["Guest"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )

    announcements: List["Announcement"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


    phone_verifications: List["PhoneVerification"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan"
        }
    )

    phone_is_verified: List["PhoneVerified"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan"
        }
    )




class UserPublic(UserBase):
    id: uuid.UUID
    detail: str
    access_token: str
    refresh_token: str


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

    phone_number: PhoneStr | None = PyField(
        description="User's phone number in international format (E.164 recommended).",
        examples=["+14155552671"],
        default=None
    )

    email: EmailStr | None = PyField(
        description="Valid email address used for account communication and login.",
        examples=["john.doe@example.com"],
        default=None
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

    terms_accepted: bool = PyField(
        default=False,
        description="Whether the user has accepted the Terms & Conditions.",
        examples=[True]
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

    @field_validator("terms_accepted")
    @classmethod
    def must_accept_terms(cls, v: bool) -> bool:
        if not v:
            raise ValueError("You must accept the Terms & Conditions to register.")
        return v

class UserCreateThroughAdmin(UserCreate):
    is_admin: bool = False
    is_rescuer: bool = False


class UserUpdate(SQLModel):
    username: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    first_name: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    last_name: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    phone_number: PhoneStr | None = Field(default=None)
    email: EmailStr | None = Field(default=None)


class UserUpdateThroughAdmin(SQLModel):
    id: uuid.UUID
    username: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    first_name: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    last_name: str | None = Field(
        default=None, max_length=50, min_length=2
    )
    phone_number: PhoneStr | None = Field(default=None)
    email: EmailStr | None = Field(default=None)
    first_name: str | None = None
    last_name: str | None = None
    is_admin: bool | None = None
    is_rescuer: bool | None = None


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


class UserInfo(UserBase):
    # (email, phone number, username, first name, last name, and id
    id: uuid.UUID
    email_verified: bool
    phone_verified: bool
