from typing import Annotated
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlmodel import select
from datetime import datetime, timezone

from app.models.email_verification import EmailVerification
from app.db_operations.auth import SessionDep
from app.models.users import User
from app.db_operations.token import get_current_user
from app.models.email_verification import send_verification_email


router = APIRouter(
    prefix='/auth/verify',
    tags=['verify', 'email'],
    responses={
        404: {'description': 'Not Found'}
    }
)

from pydantic import BaseModel

class VerifyCodeRequest(BaseModel):
    code: str

@router.post("/verify-code")
def verify_email_code(payload: VerifyCodeRequest, db: SessionDep):
    # 1. Find the verification record by code
    verification = db.exec(
        select(EmailVerification).where(
            EmailVerification.token == payload.code  # 'token' field now stores the 6-digit code
        )
    ).first()

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # 2. Check expiration (using timezone-aware UTC for 2026 standards)
    expires_at_aware = verification.expires_at.replace(tzinfo=timezone.utc)
    if expires_at_aware < datetime.now(timezone.utc):
        db.delete(verification)
        db.commit()
        raise HTTPException(status_code=400, detail="Code has expired")

    # 3. Update User
    user = db.get(User, verification.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if verification.email:
        user.email = verification.email
    user.email_verified = True
    
    # 4. Cleanup
    db.add(user)
    db.delete(verification)
    db.commit()

    return {"message": "Email verified successfully"}



@router.post("/resend-verification-code")
def resend_verification_email(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    background_tasks: BackgroundTasks,
    request: Request,
    email: str | None = None,
):
    if current_user.email_verified and not email:
        return {"message": "Email already verified"}

    # Delete any existing code before issuing a new one
    existing_code = session.exec(
        select(EmailVerification).where(EmailVerification.user_id == current_user.id)
    ).first()
    if existing_code:
        session.delete(existing_code)
        session.commit()

    send_verification_email(current_user.id, session, background_tasks, request, email=email)

    target_email = email or current_user.email
    return {"message": f"Verification code sent to {target_email}"}
