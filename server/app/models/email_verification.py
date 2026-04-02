# models/email_verification.py
import string
import random
from fastapi import BackgroundTasks, Request
from sqlmodel import SQLModel, Field, Relationship
from app.db_operations.forgot_password import generate_and_save_new_recovery_key, sign, send_email, EMAIL_API_KEY
from datetime import datetime, timedelta
from typing import Optional
import secrets
import uuid

from app.models.users import User
from app.db_operations.auth import SessionDep
from app.db_operations.auth import get_user
from app.db_operations.auth import get_domain



class EmailVerificationBase(SQLModel):
    user_id: uuid.UUID = Field(foreign_key="user.id")
    token: str = Field(index=True, nullable=False, unique=True)
    expires_at: datetime


class EmailVerification(EmailVerificationBase, table=True):
    __tablename__ = "email_verifications"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional["User"] = Relationship(back_populates="email_verifications")


class EmailVerificationCreate(EmailVerificationBase):
    pass


class EmailVerificationPublic(SQLModel):
    id: int
    user_id: uuid.UUID
    expires_at: datetime


def generate_verification_token():
    return secrets.token_urlsafe(32)

def send_verification_email(user_id:uuid.UUID, session: SessionDep, background_tasks: BackgroundTasks, request: Request):
    # generate and save token (6-digit code)
    token = "".join(random.choices(string.digits, k=6))

    user = get_user(user_id, session)

    if not user:
        raise Exception("User not found")

    verification = EmailVerification(
        user_id=user_id,
        token=token,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )

    session.add(verification)
    session.commit()

    email = user.email

    html = f"""
    <h3>Email Verification</h3>
    <p>Your verification code is:</p>
    <h2 style="letter-spacing: 5px;">{token}</h2>
    <p>This code expires in 10 minutes.</p>
    """

    background_tasks.add_task(
        send_email,
        email,
        "Verify Email",
        html
    )
