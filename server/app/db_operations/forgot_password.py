#!/usr/bin/env python3

from datetime import datetime
import secrets
from fastapi import Depends, HTTPException
import requests
import hmac
import hashlib
import time
import base64
import os
import base64
from hashlib import sha256
from uuid import UUID
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.auth import get_password_hash
from app.models.recovery import RecoveryKeyCreate, RecoveryKey
from app.models.users import User
from app.db_operations.token import SECRET_KEY
from app.models.token import PasswordResetToken
from app.db_operations.token import get_current_user

# change this to an env variable (temporary key lang muna)
EMAIL_API_KEY="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"
BREVO_URL = "https://api.brevo.com/v3/smtp/email"


def generate_recovery_key(length: int = 64) -> str:
    # Generate a secure random byte string
    raw = secrets.token_bytes(length)
    # Base64 encode for safe text storage
    return base64.urlsafe_b64encode(raw).decode("utf-8")

def get_key_hash(key: str) -> str:
    hashed = sha256(key.encode()).hexdigest()
    return hashed

# generate the key
# get hash of the key
# store to database
# give the key to the frontend

def generate_and_save_new_recovery_key(
        session: SessionDep,
        key_creation_details: RecoveryKeyCreate,
) -> str:
    # create the models for this
    key = generate_recovery_key(512)
    hashed_key = get_key_hash(key)
    user_id : UUID | None = key_creation_details.user.id
    # check if a recovery key exists

    if not user_id:
        raise Exception('User not found.')

    existing_key = session.exec(select(RecoveryKey).where(RecoveryKey.user_id == user_id)).first()

    if (existing_key):
        setattr(existing_key, 'key_hash', hashed_key)
    else:
        existing_key = RecoveryKey(
            user_id = user_id,
            key_hash = hashed_key
        )
        existing_key = RecoveryKey.model_validate(existing_key)
    if not existing_key:
        raise Exception("NO KEY")
    session.add(existing_key)
    session.commit()
    session.refresh(existing_key)
    return key

def verify_recovery_key(
        session: SessionDep,
        user: User,
        key: str
):

    hashed_key = get_key_hash(key)
    existing_key = session.exec(select(RecoveryKey).where(RecoveryKey.user_id == user.id)).first()

    if not existing_key:
        return False

    if not existing_key.key_hash == hashed_key:
        return False

    # invalidate the key
    session.delete(existing_key)
    session.commit()

    return True




def sign(data: str) -> str:
    signature = hmac.new(SECRET_KEY.encode(), data.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode()


def send_email(to_email: str, subject: str, html_content: str):
    headers = {
        "accept": "application/json",
        "api-key": EMAIL_API_KEY,
        "content-type": "application/json"
    }

    data = {
        "sender": {
            "name": "Emmanuel Parreno",
            "email": "parrenoemmanuel755@gmail.com"
        },
        "to": [
            {"email": to_email}
        ],
        "subject": subject,
        "htmlContent": html_content
    }

    response = requests.post(BREVO_URL, json=data, headers=headers)

    if response.status_code >= 400:
        raise Exception(f"Brevo error: {response.text}")

def get_reset_token_hash(token: str):
    return hashlib.sha256(token.encode()).hexdigest()

def get_reset_token_from_db(token_hash: str, session: SessionDep):
    return session.exec(select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)).first()

def generate_reset_token():
    raw_token = secrets.token_urlsafe(32)  # this goes in URL
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return {"raw_token": raw_token, "token_hash": token_hash }

def store_reset_token_in_db(
    *,
    user_id: UUID,
    token_hash: str,
    expires_at: datetime,
    session: SessionDep
):
    """
    Stores a new password reset token for a user.
    Deletes any existing reset tokens for that user first.
    """

    # Remove existing tokens for this user (one active token policy)
    existing_tokens = session.exec(
        select(PasswordResetToken)
        .where(PasswordResetToken.user_id == user_id)
    ).all()

    for token in existing_tokens:
        session.delete(token)

    # Create new reset token record
    reset_token = PasswordResetToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )

    session.add(reset_token)
    session.commit()

    return reset_token


def validate_reset_token(token: str, session: SessionDep) -> PasswordResetToken:
    token_hash = get_reset_token_hash(token)

    reset_record = get_reset_token_from_db(token_hash, session)

    if not reset_record:
        raise HTTPException(status_code=403, detail="Invalid token")
    if datetime.utcnow() > reset_record.expires_at:
        raise HTTPException(status_code=403, detail="Token expired")

    return reset_record


def generate_reset_code():
    return str(secrets.randbelow(900000) + 100000)
