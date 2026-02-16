from typing import Annotated
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlmodel import select
from datetime import datetime

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

@router.get("/email", response_class=HTMLResponse)
def verify_email(token: str, db: SessionDep):

    verification = db.exec(
        select(EmailVerification).where(
            EmailVerification.token == token
        )
    ).first()

    print(verification)

    if not verification:
        raise HTTPException(status_code=400, detail="Invalid token")

    if verification.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Token expired")

    user = db.get(User, verification.user_id)

    if not user:
        raise HTTPException(404, "User not found")

    user.email_verified = True

    db.delete(verification)
    db.commit()

    return """Email verified. You can now return to the application."""



@router.get("/resend-verification-email", response_class=HTMLResponse)
def resend_verification_email(current_user: Annotated[User, Depends(get_current_user)], session: SessionDep, background_tasks: BackgroundTasks, request: Request):
    try:
        send_verification_email(current_user.id, session, background_tasks, request)
    except:
        raise HTTPException(400, "Error sending an email. Please try again in a while")

    return f"Email verification sent to {current_user.email}"
