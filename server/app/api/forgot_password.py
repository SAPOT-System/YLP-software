import random
import requests
import hashlib
from typing import Optional, List
from app.models.securityQuestions import UserSecurityQuestion
from urllib.parse import urlencode
from fastapi import APIRouter, File, Request, UploadFile, BackgroundTasks
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
from app.models.token import PasswordResetToken
from app.db_operations.forgot_password import store_reset_token_in_db
from app.db_operations.forgot_password import get_reset_token_hash
from app.db_operations.forgot_password import get_reset_token_from_db
from app.db_operations.forgot_password import validate_reset_token
from app.db_operations.auth import get_domain
from app.db_operations.forgot_password import generate_reset_token
from app.db_operations.verify_user import require_verified_user

LINK_TTL_SECONDS = 30 * 60  # 30 minutes


def reset_link_template(token:str, request: Request):
    RESET_LINK = f"{get_domain(request)}:8000/auth/forgot-password/reset-password?token={token}"
    return RESET_LINK

router = APIRouter(
    prefix='/auth/forgot-password',
    tags=['auth', 'forgot password'],
    responses={
        404: {'description': 'Not Found'}
    },
    # dependencies=[Depends(require_verified_user)]
)

@router.post('/generate-new-recovery-key')
def get_recovery_key(
        current_user : Annotated[User, Depends(require_verified_user)],
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
        request: Request,
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
    expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

    raw_token = secrets.token_urlsafe(32)  # this goes in URL
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

    store_reset_token_in_db(
        user_id=current_user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        session=session
    )

    return {
        'recovery-link': reset_link_template(raw_token, request),
        'method': 'POST',
        'expire_in_seconds': LINK_TTL_SECONDS
    }

@router.get("/reset-password")
def can_reset_password(token: str, session: SessionDep):
    validate_reset_token(token, session)
    return {"detail": "Valid token. Use POST request."}


@router.post("/reset-password")
def reset_password(
        token: str,
        new_password_data: UserPasswordUpdateNoOldPassword,
        session: SessionDep
):
    reset_record = validate_reset_token(token, session)

    user = session.exec(select(User).where(reset_record.user_id == User.id)).first()

    if not user:
        raise HTTPException(status_code=404, detail="Invalid user data")

    update_user_password(user, new_password_data.new_password, session)

    session.delete(reset_record)
    session.commit()

    return {
        "message": "password updated successfully."
    }


@router.post("/email")
def send_reset(email: str, background_tasks: BackgroundTasks, session: SessionDep, request: Request):

    current_user = get_user(email, session)

    if current_user:
        raw_token, token_hash = generate_reset_token().values()
        expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

        store_reset_token_in_db(
            user_id=current_user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            session=session
        )

        reset_link = reset_link_template(raw_token, request)

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
        current_user : Annotated[User, Depends(require_verified_user)],
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

    raw_token, token_hash = generate_reset_token().values()
    expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

    store_reset_token_in_db(
        user_id=current_user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        session=session
    )

    return SecurityQuestionOut(question=question.question)


@router.post("/security-question/answer")
def verify_security_answer(
        identifier: str,
        payload: SecurityAnswerIn,
        session: SessionDep,
        request: Request
):

    user = get_user(identifier, session)

    if not user:
        raise HTTPException(404, 'Invalid token')

    user_id = user.id

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

    raw_token, token_hash = generate_reset_token().values()
    expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

    store_reset_token_in_db(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        session=session
    )

    reset_link = reset_link_template(raw_token, request)

    return {
        "correct": True,
        "reset_link": reset_link,
    }

@router.get("/generate-security-question")
def generate_security_question(
        current_user : Annotated[User, Depends(require_verified_user)]
):
    response = requests.get("https://api.truthordarebot.xyz/v1/truth")
    data = response.json()
    return {"question": data["question"]}
