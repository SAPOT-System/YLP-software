from fastapi import Depends, HTTPException
from app.db_operations.token import get_current_user
from app.db_operations.auth import SessionDep


def require_verified_user(user=Depends(get_current_user)):
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="Email not verified. Please check your email.")
    return user


def verify_user(session: SessionDep, user=Depends(get_current_user)):
    setattr(user, "email_verified", True)
    session.add(user)
    session.commit()
    session.refresh(user)
