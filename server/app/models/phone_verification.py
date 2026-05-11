import string
import random
from fastapi import BackgroundTasks, Request
from sqlmodel import BigInteger, SQLModel, Field, Relationship
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Optional
import uuid


if TYPE_CHECKING:
    from app.models.users import User


# phone_verification.py
#
# FastAPI + SQLModel phone verification system
#
# Flow
# 1. User requests verification code
# 2. Server generates 6-digit OTP
# 3. Server sends SMS through GSM service
# 4. User submits OTP
# 5. Server marks phone as verified
#
# Recommended:
# - code expiry: 5 minutes
# - max attempts
# - resend cooldown
# - store hashed OTP in production
#

import random
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import (
    SQLModel,
    Field,
    Relationship,
    Session,
    select,
)

# =============================================================================
# HELPERS
# =============================================================================

def now_ms():
    return int(time.time() * 1000)


def generate_otp():
    return str(random.randint(100000, 999999))


# =============================================================================
# USER MODEL PATCH
# =============================================================================

# ADD THIS TO YOUR USER MODEL:
#
# phone_verified: bool = Field(default=False)
#
# phone_verifications: List["PhoneVerification"] = Relationship(
#     back_populates="user",
#     sa_relationship_kwargs={
#         "cascade": "all, delete-orphan"
#     }
# )

# =============================================================================
# PHONE VERIFICATION TABLE
# =============================================================================

class PhoneVerified(SQLModel, table=True):
    __tablename__ = "phone_verified"

    id: uuid.UUID | None = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )

    user_id: uuid.UUID = Field(
        foreign_key="user.id",
        index=True,
        ondelete="CASCADE"
    )

    user: Optional["User"] = Relationship(
        back_populates="phone_is_verified"
    )


class PhoneVerification(SQLModel, table=True):
    __tablename__ = "phone_verification"

    id: uuid.UUID | None = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )

    user_id: uuid.UUID = Field(
        foreign_key="user.id",
        index=True,
        ondelete="CASCADE"
    )

    phone_number: str = Field(
        index=True,
        max_length=20
    )

    verification_code: str = Field(
        max_length=6,
        min_length=6,
        index=True
    )

    is_used: bool = Field(
        default=False,
        index=True
    )

    attempts: int = Field(
        default=0
    )

    expires_at: int = Field(
        sa_type=BigInteger(),
        nullable=False,
        index=True,
    )

    created_at: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(),
        nullable=False,
    )

    user: Optional["User"] = Relationship(
        back_populates="phone_verifications"
    )


# =============================================================================
# REQUEST MODELS
# =============================================================================

class RequestPhoneVerification(BaseModel):
    phone_number: str


class VerifyPhoneCode(BaseModel):
    code: str


# =============================================================================
# GSM SMS SENDER
# =============================================================================

def send_sms(phone: str, message: str):
    """
    Replace this with your GSM FastAPI call.
    """

    print(f"[SMS] TO={phone}")
    print(message)

    # Example:
    #
    # requests.post(
    #     "http://gsm-api/send",
    #     json={
    #         "phone": phone,
    #         "message": message
    #     }
    # )



# =============================================================================
# ROUTER
# =============================================================================

