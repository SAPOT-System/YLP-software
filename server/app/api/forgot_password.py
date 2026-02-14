import random
from typing import Optional, List
from app.models.securityQuestions import UserSecurityQuestion
from urllib.parse import urlencode
from fastapi import APIRouter, File, UploadFile, BackgroundTasks
import hmac
import time
from fastapi.responses import StreamingResponse
from fastapi.responses import Response
import secrets
from typing import Annotated
import uuid
import io

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.utils import generate_unique_id
from sqlmodel import Field, Session, SQLModel, create_engine, select

from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import  OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
from pydantic import BaseModel
from starlette.status import HTTP_401_UNAUTHORIZED

from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash, update_user_password
from app.models.token import Token
from app.db_operations.token import ACCESS_TOKEN_EXPIRE_MINUTES, create_access_token
from app.models.users import User, UserCreate, UserPublic
from app.db_operations.token import get_current_user
from app.db_operations.forgot_password import generate_and_save_new_recovery_key, sign, send_email, EMAIL_API_KEY
from app.models.recovery import RecoveryKeyCreate
from app.db_operations.forgot_password import verify_recovery_key
from app.db_operations.auth import get_user, verify_password
from app.models.users import UserPasswordUpdateNoOldPassword
from app.models.securityQuestions import AddSecurityQuestion, SecurityQuestionOut, SecurityAnswerOut, SecurityAnswerIn

LINK_TTL_SECONDS = 30 * 60  # 30 minutes

router = APIRouter(
    prefix='/auth/forgot-password',
    tags=['auth', 'forgot password'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.post('/generate-new-recovery-key')
def get_recovery_key(
        current_user : Annotated[User, Depends(get_current_user)],
        session : SessionDep,
):
    key_data = RecoveryKeyCreate(user=current_user)
    new_key = generate_and_save_new_recovery_key(session, key_data)
    return Response(
        content=new_key,
        media_type="text/plain",
        headers={
            "Content-Disposition": "attachment; filename=recovery-key.txt",
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
        },
    )


@router.post('/recovery-with-recovery-key')
async def recover_with_recovery_key(
        user_identifier: str,
        session : SessionDep,
        key_file: UploadFile = File(...)
):
    current_user = get_user(user_identifier, session)

    if not current_user:
        raise HTTPException(status_code=400, detail="Invalid account identier.")

    if key_file.content_type not in ("text/plain", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    content = await key_file.read()

    key_text = content.decode("utf-8").strip()

    if len(key_text) < 20:
        raise HTTPException(status_code=400, detail="Recovery key is too short")


    if not verify_recovery_key(session, current_user, key_text):
        raise HTTPException(status_code=400, detail="Invalid key.")

    # give a signed link for password reset
    expires = int(time.time()) + LINK_TTL_SECONDS
    payload = f"{current_user.username}:{expires}"

    signature = sign(payload)
    return {
        'recovery-link': f'/auth/forgot-password/reset-password?expires={expires}&signature={signature}&username={current_user.username}',
        'method': 'POST',
        'expire_in_seconds': LINK_TTL_SECONDS
    }

@router.get("/reset-password")
def can_reset_password(username: str, expires: int, signature: str):
    if time.time() > expires:
        raise HTTPException(status_code=403, detail="Link expired")

    payload = f"{username}:{expires}"
    expected_signature = sign(payload)

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")


    return {
        'detail': 'Valid signature. Use POST request.',
    }


@router.post("/reset-password")
def reset_password(username: str, new_password_data: UserPasswordUpdateNoOldPassword, expires: int, signature: str, session: SessionDep):
    if time.time() > expires:
        raise HTTPException(status_code=403, detail="Link expired")

    payload = f"{username}:{expires}"
    expected_signature = sign(payload)

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=403, detail="Invalid signature")

    user = get_user(username, session)

    if not user:
        raise HTTPException(status_code=404, detail="Invalid user data")



    update_user_password(user, new_password_data.new_password, session)

    return {
        "message": "password updated successfully."
    }


@router.post("/email")
def send_reset(email: str, background_tasks: BackgroundTasks, session: SessionDep):

    current_user = get_user(email, session)

    if current_user:
        expires = int(time.time()) + LINK_TTL_SECONDS
        payload = f"{current_user.username}:{expires}"


        signature = sign(payload)

        params = {
            "username": current_user.username,
            "expires": expires,
            "signature": signature,
        }

        reset_link = f"http://localhost:8000/auth/forgot-password/reset-password?{urlencode(params)}"

        # reset_link = generate_unique_id

        html = f"""
        <h3>Password Reset</h3>
        <p>Click below to reset your password:</p>
        <a href="{reset_link}">Reset Password</a>
        <p>This link expires in 30 minutes.</p>
        """

        background_tasks.add_task(
            send_email,
            email,
            "Reset Your Password",
            html
        )
    return {"message": "If the account exists, a reset link was sent."}


@router.post("/security-questions")
def add_security_questions(
        current_user : Annotated[User, Depends(get_current_user)],
        questions: AddSecurityQuestion,  # [{"question": "...", "answer": "..."}]
        session: SessionDep
):

    for q in questions.questions:
        question_record = UserSecurityQuestion(
            user_id=current_user.id,
            question=q.question.strip(),
            answer_hash=get_password_hash(q.answer)
        )
        session.add(question_record)
    session.commit()
    return {"message": "Security questions saved successfully."}


@router.get("/security-question", response_model=SecurityQuestionOut)
def get_security_question(
        identifier: str,
        session: SessionDep
):
    current_user = get_user(identifier, session)
    questions = session.exec(
        select(UserSecurityQuestion).where(UserSecurityQuestion.user_id == current_user.id)
    ).all()

    if not questions:
        raise HTTPException(status_code=404, detail="No security questions found for this user")

    # pick one random question
    question = random.choice(questions)
    return SecurityQuestionOut(question=question.question)


@router.post("/security-question/answer")
def verify_security_answer(
        identifier: str,
        payload: SecurityAnswerIn,
        session: SessionDep
):

    current_user = get_user(identifier, session)

    if not current_user:
        raise HTTPException(404, 'User not found')

    user_id = current_user.id

    db_question = session.exec(
        select(UserSecurityQuestion)
        .where(UserSecurityQuestion.user_id == user_id)
        .where(UserSecurityQuestion.question == payload.question)
    ).first()

    if not db_question:
        raise HTTPException(status_code=404, detail="Security question not found")

    is_correct = verify_password(
        payload.answer.strip(),
        db_question.answer_hash
    )

    if not is_correct:
        return {"correct": False}

    expires = int(time.time()) + LINK_TTL_SECONDS
    payload_str = f"{current_user.username}:{expires}"
    signature = sign(payload_str)

    params = {
        "username": current_user.username,
        "expires": expires,
        "signature": signature
    }

    reset_link = f"http://localhost:8000/auth/forgot-password/reset-password?{urlencode(params)}"

    return {
        "correct": True,
        "reset_link": reset_link
    }
