import random
import json
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
from app.models.recovery import RecoveryKey, RecoveryKeyCreate
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
from app.db_operations.forgot_password import generate_reset_code
from app.models.PasswordResetCode import PasswordResetCode
from app.models.PhonePasswordResetCode import PhonePasswordResetCode
from app.api.gsm import sendToModule
from app.db_operations.auth import get_user_by_phone_number
from app.db_operations.wrapped_key_recovery import (
    create_recovery_session,
    validate_recovery_session,
    mark_recovery_session_used,
)
from app.models.recovery_session import RecoverySession
from app.models.email_recovery_token import EmailRecoveryToken
from app.models.wrapped_key import WrappedKey
from app.db_operations.device_attempts import (
    check_and_increment_attempt,
    reset_attempts,
)
from app.limiter import limiter

LINK_TTL_SECONDS = 30 * 60  # 30 minutes


def _apply_ip_gate(
    session,
    user,
    recovery_method: str,
    request: Request,
) -> tuple[Optional[int], Optional[str]]:
    """
    Returns (attempts_remaining, client_ip). Raises HTTPException(429) on lockout.
    Returns (None, None) when user is unknown (no gate applied).
    """
    if not user:
        return None, None

    forwarded_for = request.headers.get("X-Forwarded-For")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (
        request.client.host if request.client else "unknown"
    )
    gate = check_and_increment_attempt(
        session, user.id, client_ip,
        table="recovery", recovery_method=recovery_method,
    )
    if not gate["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "locked_until": gate["locked_until"].isoformat(),
                "attempts_remaining": 0,
            },
        )
    return gate["attempts_remaining"], client_ip

RECOVERY_KEY_COOLDOWN_DAYS = 30
SECURITY_QUESTION_MIN_DAYS = 90
SECURITY_QUESTION_MAX_DAYS = 180


class RecoveryKeyConstraint(BaseModel):
    has_key: bool
    can_change: bool
    days_since_generated: int | None
    days_until_changeable: int | None

class SecurityQuestionConstraint(BaseModel):
    has_question: bool
    can_change: bool
    is_burned: bool
    is_expired: bool
    days_since_set: int | None
    days_until_changeable: int | None
    days_until_expiry: int | None

class RecoveryConstraintsOut(BaseModel):
    recovery_key: RecoveryKeyConstraint
    security_question: SecurityQuestionConstraint


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

class PhoneResetRequest(BaseModel):
    phone_number: str

class PhoneCodeRequest(BaseModel):
    phone_number: str
    code: str


@router.post('/phone')
async def send_phone_reset(body: PhoneResetRequest, background_tasks: BackgroundTasks, session: SessionDep):
    try:
        current_user = get_user_by_phone_number(session, body.phone_number)
    except HTTPException:
        return {"message": "If the account exists, a reset code was sent."}

    code = generate_reset_code()
    reset_code = PhonePasswordResetCode(
        phone_number=body.phone_number,
        code=code,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    session.add(reset_code)
    session.commit()
    background_tasks.add_task(
        sendToModule,
        body.phone_number,
        f"Your password reset code is: {code}. It expires in 10 minutes."
    )
    return {"message": "If the account exists, a reset code was sent."}


@router.post('/phone-code')
@limiter.limit("10/minute")
def confirm_phone_code(
    body: PhoneCodeRequest,
    session: SessionDep,
    request: Request,
):
    phone_number, code = body.phone_number, body.code
    current_user = get_user_by_phone_number(session, phone_number)
    device_applied, applied_fingerprint = _apply_ip_gate(
        session, current_user, "phone_otp", request,
    )

    record = session.exec(
        select(PhonePasswordResetCode).where(
            PhonePasswordResetCode.phone_number == phone_number,
            PhonePasswordResetCode.code == code,
        )
    ).first()

    if not record:
        raise HTTPException(status_code=400, detail={"message": "Invalid code.", "attempts_remaining": device_applied})

    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail={"message": "Code expired.", "attempts_remaining": device_applied})

    session.delete(record)
    session.commit()

    raw_token, token_hash = generate_reset_token().values()
    expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

    store_reset_token_in_db(
        user_id=current_user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        session=session
    )

    recovery_expires_at = datetime.utcnow() + timedelta(minutes=15)
    recovery_result = create_recovery_session(session, current_user.id, "phone", recovery_expires_at)

    if applied_fingerprint:
        reset_attempts(session, current_user.id, applied_fingerprint,
                       table="recovery", recovery_method="phone_otp")

    return {
        'link': reset_link_template(raw_token, request),
        'detail': 'Use POST request with the new password to reset the password',
        'recovery_token': recovery_result['raw_token'],
    }


@router.post('/generate-new-recovery-key')
def get_recovery_key(
        request: Request,
        current_user : Annotated[User, Depends(get_current_user)],
        session : SessionDep,
):
    current_password = request.headers.get("X-Current-Password")
    if not current_password or not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password.")

    now = datetime.utcnow()
    existing_key = session.exec(
        select(RecoveryKey).where(RecoveryKey.user_id == current_user.id)
    ).first()

    if existing_key:
        days_since = (now - existing_key.updated_at).days
        if days_since < RECOVERY_KEY_COOLDOWN_DAYS:
            days_remaining = RECOVERY_KEY_COOLDOWN_DAYS - days_since
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RECOVERY_KEY_COOLDOWN",
                    "message": f"Recovery key can only be regenerated after {RECOVERY_KEY_COOLDOWN_DAYS} days.",
                    "days_remaining": days_remaining,
                },
            )

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
@limiter.limit("10/minute")
async def recover_with_recovery_key(
        user_identifier: str,
        request: Request,
        session: SessionDep,
        key_file: UploadFile = File(...),
):
    current_user = get_user(user_identifier, session)

    if not current_user:
        raise HTTPException(status_code=400, detail="Invalid account identier.")

    device_applied, applied_fingerprint = _apply_ip_gate(
        session, current_user, "recovery_key", request,
    )

    if key_file.content_type not in ("text/plain", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Invalid file type")

    content = await key_file.read()

    key_text = content.decode("utf-8").strip()

    if len(key_text) < 20:
        raise HTTPException(status_code=400, detail="Recovery key is too short")


    if not verify_recovery_key(session, current_user, key_text):
        raise HTTPException(status_code=400, detail={"message": "Invalid key.", "attempts_remaining": device_applied})

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

    recovery_expires_at = datetime.utcnow() + timedelta(minutes=15)
    recovery_result = create_recovery_session(session, current_user.id, "token", recovery_expires_at)

    if applied_fingerprint:
        reset_attempts(session, current_user.id, applied_fingerprint,
                       table="recovery", recovery_method="recovery_key")

    return {
        'recovery-link': reset_link_template(raw_token, request),
        'method': 'POST',
        'expire_in_seconds': LINK_TTL_SECONDS,
        'recovery_token': recovery_result['raw_token'],
    }

from fastapi.responses import HTMLResponse

@router.get("/reset-password")
def can_reset_password(token: str, session: SessionDep):
    reset_record = validate_reset_token(token, session)
    user = session.exec(select(User).where(User.id == reset_record.user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"detail": "Valid token. Use POST request.", "user_id": str(user.id)}


class PasswordResetRequest(SQLModel):
    new_password: str = Field(min_length=8)
    wrapped_blob: Optional[str] = None
    recovery_token: Optional[str] = None


@router.post("/reset-password")
def reset_password(
        token: str,
        new_password_data: PasswordResetRequest,
        session: SessionDep
):
    reset_record = validate_reset_token(token, session)

    user = session.exec(select(User).where(reset_record.user_id == User.id)).first()

    if not user:
        raise HTTPException(status_code=404, detail="Invalid user data")

    update_user_password(user, new_password_data.new_password, session)

    if new_password_data.wrapped_blob:
        existing_wk = session.exec(select(WrappedKey).where(WrappedKey.user_id == user.id)).first()
        if existing_wk:
            existing_wk.wrapped_blob = new_password_data.wrapped_blob
            existing_wk.updated_at = datetime.utcnow()
            session.add(existing_wk)
        else:
            session.add(WrappedKey(user_id=user.id, wrapped_blob=new_password_data.wrapped_blob))

    session.delete(reset_record)

    # Best-effort: burn recovery session atomically with the password update.
    # Silently skip if missing, invalid, already used, or expired.
    if new_password_data.recovery_token:
        try:
            rec = validate_recovery_session(session, new_password_data.recovery_token)
            mark_recovery_session_used(session, rec)
        except HTTPException:
            pass

    session.commit()

    return {
        "message": "password updated successfully."
    }


@router.post("/email-code")
@limiter.limit("10/minute")
def confirm_code(
    email: str,
    code: str,
    session: SessionDep,
    request: Request,
):
    current_user = get_user(email, session)
    device_applied, applied_fingerprint = _apply_ip_gate(
        session, current_user, "email_otp", request,
    )
    if current_user:
        statement=  select(PasswordResetCode).where(
            PasswordResetCode.email == email,
            PasswordResetCode.code == code
        )

        record = session.exec(statement).first()

        if not record:
            raise HTTPException(400, {"message": "Invalid code", "attempts_remaining": device_applied})


        if record.expires_at < datetime.utcnow():
            raise HTTPException(400, {"message": "Code expired", "attempts_remaining": device_applied})

        session.delete(record)
        session.commit()

        raw_token, token_hash = generate_reset_token().values()
        expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

        store_reset_token_in_db(
            user_id=current_user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            session=session
        )

        reset_link = reset_link_template(raw_token, request)

        recovery_expires_at = datetime.utcnow() + timedelta(minutes=15)
        recovery_result = create_recovery_session(session, current_user.id, "email", recovery_expires_at)

        if applied_fingerprint:
            reset_attempts(session, current_user.id, applied_fingerprint,
                           table="recovery", recovery_method="email_otp")

        return {
            'link': reset_link,
            'detail': 'Use POST request with the new password to reset the password',
            'recovery_token': recovery_result['raw_token'],
        }
    raise HTTPException(401, "Invalid user.")

@router.post("/email")
def send_reset(email: str, background_tasks: BackgroundTasks, session: SessionDep, request: Request):

    current_user = get_user(email, session)

    if current_user:
        code = generate_reset_code()

        reset_code = PasswordResetCode(
            email=email,
            code=code,
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        session.add(reset_code)
        session.commit()


        html = f"""
        <h3>Password Reset</h3>
        <p>Your code is:</p>
        <h3>{code}</h3>
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
        request: Request,
        current_user : Annotated[User, Depends(get_current_user)],
        questions: AddSecurityQuestion,
        session: SessionDep
):
    current_password = request.headers.get("X-Current-Password")
    if not current_password or not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect password.")

    if not questions.questions:
        raise HTTPException(status_code=422, detail="At least one question is required.")

    now = datetime.utcnow()
    existing = session.exec(
        select(UserSecurityQuestion).where(UserSecurityQuestion.user_id == current_user.id)
    ).first()

    if existing:
        days_since = (now - existing.created_at).days
        is_expired = days_since >= SECURITY_QUESTION_MAX_DAYS
        can_change = existing.is_burned or is_expired or days_since >= SECURITY_QUESTION_MIN_DAYS

        if not can_change:
            days_remaining = SECURITY_QUESTION_MIN_DAYS - days_since
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "SECURITY_QUESTION_COOLDOWN",
                    "message": f"Security question can only be changed after {SECURITY_QUESTION_MIN_DAYS} days.",
                    "days_remaining": days_remaining,
                },
            )
        session.delete(existing)
        session.flush()

    q = questions.questions[0]
    new_question = UserSecurityQuestion(
        user_id=current_user.id,
        question=q.question.strip(),
        answer_hash=get_password_hash(q.answer),
        created_at=now,
        is_burned=False,
    )
    session.add(new_question)
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
@limiter.limit("10/minute")
def verify_security_answer(
        identifier: str,
        payload: SecurityAnswerIn,
        session: SessionDep,
        request: Request,
):
    user = get_user(identifier, session)

    if not user:
        raise HTTPException(404, 'Invalid token')

    device_applied, applied_fingerprint = _apply_ip_gate(
        session, user, "security_question", request,
    )

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
        return {"correct": False, "attempts_remaining": device_applied}

    db_question.is_burned = True
    session.add(db_question)
    session.flush()

    raw_token, token_hash = generate_reset_token().values()
    expires_at = datetime.utcnow() + timedelta(seconds=LINK_TTL_SECONDS)

    store_reset_token_in_db(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        session=session
    )

    reset_link = reset_link_template(raw_token, request)

    recovery_expires_at = datetime.utcnow() + timedelta(minutes=15)
    recovery_result = create_recovery_session(session, user_id, "qa", recovery_expires_at)

    if applied_fingerprint:
        reset_attempts(session, user.id, applied_fingerprint,
                       table="recovery", recovery_method="security_question")

    return {
        "correct": True,
        "reset_link": reset_link,
        "recovery_token": recovery_result['raw_token'],
    }

@router.get("/generate-security-question")
def generate_security_question(
        current_user : Annotated[User, Depends(get_current_user)]
):
    questions = [
        "What was the name of your first pet?",
        "In what city was your first job?",
        "What is the name of the street you grew up on?",
        "What was your childhood nickname?",
        "What was the make of your first car?",
        "What was your high school mascot?",
        "What is your mother's maiden name?",
        "What is your paternal grandmother's first name?",
        "What is the name of your favorite childhood teacher?",
        "In what city did your parents meet?",
        "What was the name of your first elementary school?",
        "What is the name of your favorite book?",
        "What is your favorite movie?",
        "What was your favorite food as a child?",
        "What was the name of the hospital where you were born?",
        "What is the name of your oldest cousin?",
        "What is the first name of your best friend in high school?",
        "What was the first concert you attended?",
        "What is the name of your favorite sports team?",
        "What was the destination of your first flight?",
        "What was the color of your first bicycle?",
        "What was the title of your first job?",
        "What was your favorite toy as a child?",
        "In what city did you spend your honeymoon?",
        "What was the name of your first boyfriend or girlfriend?",
        "What was the name of your first stuffed animal?",
        "What is the name of the street where your best friend lives?",
        "What was your favorite subject in school?",
        "What was the name of your first boss?",
        "What is the middle name of your youngest sibling?",
        "What is the name of the first company you worked for?",
        "What is your favorite singer's name?",
        "What was the name of your high school graduation speaker?",
        "What was the name of your favorite cartoon character?",
        "What was your favorite place to visit as a child?",
        "What is the name of the beach you visited most often?",
        "What was the name of your first neighborhood?",
        "What is the name of your favorite pizza topping?",
        "What is the name of the person you first kissed?",
        "What is the last name of your favorite musician?",
        "In what town was your maternal grandfather born?",
        "What was the first video game you ever played?",
        "What is the name of the first street you lived on?",
        "What was the name of your primary school principal?",
        "What is the middle name of your oldest sibling?",
        "What was your childhood dream job?",
        "What is the name of your favorite aunt?",
        "What is the name of your favorite uncle?",
        "What was your favorite hobby in high school?",
        "In what city did you celebrate your 21st birthday?",
        "What is the name of your favorite coffee shop?",
        "What was the brand of your first cell phone?",
        "What was the name of your first college roommate?",
        "In what city is your favorite vacation spot?",
        "What was the first album you ever bought?",
        "What was the name of the park near your childhood home?",
        "What is the name of your favorite local restaurant?",
        "What was your favorite holiday as a child?",
        "What is the name of your favorite board game?",
        "What is your father's middle name?",
        "What is your mother's middle name?",
        "What was your favorite color in kindergarten?",
        "What is the first name of your favorite author?",
        "What was the name of your high school English teacher?",
        "In what city did you get engaged?",
        "What is the name of your favorite museum?",
        "What was the name of the person who taught you to drive?",
        "What was your favorite snack in grade school?",
        "What is the name of your favorite poem?",
        "What is your favorite brand of shoes?",
        "What is the first name of your favorite athlete?",
        "What was the first musical instrument you learned?",
        "What is the name of your favorite flower?",
        "What was the name of your first manager?",
        "What is your favorite video game character?",
        "What is the middle name of your favorite cousin?",
        "In what city was your father born?",
        "In what city was your mother born?",
        "What was the name of your first car's model?",
        "What was your favorite fairy tale as a child?",
        "What was your favorite outdoor activity as a kid?",
        "What is the name of your favorite ice cream flavor?",
        "What is the first name of your wedding's best man?",
        "What is the first name of your maid of honor?",
        "What was the name of your childhood church?",
        "What was your favorite sitcom in high school?",
        "What was the first brand of computer you owned?",
        "What was the name of your first pet's veterinarian?",
        "What is the name of your favorite historical figure?",
        "What was your favorite dessert as a child?",
        "What is the name of your favorite superhero?",
        "What was the first play or musical you saw?",
        "What was the name of your favorite campsite?",
        "What is the name of your favorite national park?",
        "What was the first movie you saw in a theater?",
        "What is the name of your favorite childhood library?",
        "What was your favorite clothing brand in high school?",
        "What was the name of your high school science teacher?",
        "What is the name of the first lake you swam in?",
        "What was the first brand of watch you owned?",
        "What is the first name of your favorite poet?"
    ]
    return questions


@router.get("/recovery-constraints", response_model=RecoveryConstraintsOut)
def get_recovery_constraints(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    now = datetime.utcnow()

    rk = session.exec(select(RecoveryKey).where(RecoveryKey.user_id == current_user.id)).first()
    if rk is None:
        rk_constraint = RecoveryKeyConstraint(
            has_key=False,
            can_change=True,
            days_since_generated=None,
            days_until_changeable=None,
        )
    else:
        days_since = (now - rk.updated_at).days
        days_remaining = max(0, RECOVERY_KEY_COOLDOWN_DAYS - days_since)
        rk_constraint = RecoveryKeyConstraint(
            has_key=True,
            can_change=days_remaining == 0,
            days_since_generated=days_since,
            days_until_changeable=days_remaining if days_remaining > 0 else None,
        )

    sq = session.exec(
        select(UserSecurityQuestion).where(UserSecurityQuestion.user_id == current_user.id)
    ).first()
    if sq is None:
        sq_constraint = SecurityQuestionConstraint(
            has_question=False,
            can_change=True,
            is_burned=False,
            is_expired=False,
            days_since_set=None,
            days_until_changeable=None,
            days_until_expiry=None,
        )
    else:
        days_since = (now - sq.created_at).days
        is_expired = days_since >= SECURITY_QUESTION_MAX_DAYS
        days_remaining = max(0, SECURITY_QUESTION_MIN_DAYS - days_since)
        can_change = sq.is_burned or is_expired or days_remaining == 0
        sq_constraint = SecurityQuestionConstraint(
            has_question=True,
            can_change=can_change,
            is_burned=sq.is_burned,
            is_expired=is_expired,
            days_since_set=days_since,
            days_until_changeable=days_remaining if days_remaining > 0 else None,
            days_until_expiry=max(0, SECURITY_QUESTION_MAX_DAYS - days_since) if not is_expired else None,
        )

    return RecoveryConstraintsOut(recovery_key=rk_constraint, security_question=sq_constraint)


@router.post("/otp/send")
@limiter.limit("3/minute")
def send_recovery_otp(
    request: Request,
    body: PhoneResetRequest,
    background_tasks: BackgroundTasks,
    session: SessionDep,
):
    user = get_user_by_phone_number(session, body.phone_number)
    if not user:
        return {"message": "OTP sent if account exists."}

    code = generate_reset_code()
    code_hash = hashlib.sha256(code.encode()).hexdigest()

    existing = session.exec(
        select(PhonePasswordResetCode).where(
            PhonePasswordResetCode.phone_number == body.phone_number
        )
    ).all()
    for row in existing:
        session.delete(row)
    session.commit()

    record = PhonePasswordResetCode(
        phone_number=body.phone_number,
        code=code_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    session.add(record)
    session.commit()

    background_tasks.add_task(
        sendToModule,
        body.phone_number,
        f"Your Sapot recovery code is: {code}. Valid for 10 minutes.",
    )
    return {"message": "OTP sent if account exists."}


@router.post("/otp/verify")
@limiter.limit("5/minute")
def verify_recovery_otp(
    request: Request,
    body: PhoneCodeRequest,
    session: SessionDep,
):
    record = session.exec(
        select(PhonePasswordResetCode).where(
            PhonePasswordResetCode.phone_number == body.phone_number
        )
    ).first()
    if not record:
        raise HTTPException(status_code=400, detail="No OTP found for this number")

    if record.attempts >= 3:
        locked_until = datetime.now(timezone.utc) + timedelta(minutes=10)
        raise HTTPException(
            status_code=429,
            detail={
                "locked_until": locked_until.isoformat(),
                "device_type": "anonymous",
                "attempts_remaining": 0,
            },
        )

    if record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired")

    code_hash = hashlib.sha256(body.code.encode()).hexdigest()
    if not hmac.compare_digest(record.code, code_hash):
        record.attempts += 1
        session.add(record)
        session.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    user = get_user_by_phone_number(session, body.phone_number)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    session.delete(record)
    session.commit()

    expires_at = datetime.utcnow() + timedelta(minutes=15)
    result = create_recovery_session(session, user.id, "phone", expires_at)
    return {"recovery_token": result["raw_token"], "user_id": str(user.id)}


@router.post("/email-recovery/send")
@limiter.limit("3/minute")
def send_email_recovery(
    request: Request,
    background_tasks: BackgroundTasks,
    session: SessionDep,
    email: str = Query(...),
):
    user = get_user(email, session)
    if not user:
        return {"message": "Recovery email sent if account exists."}

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    existing = session.exec(
        select(EmailRecoveryToken).where(EmailRecoveryToken.user_id == user.id)
    ).all()
    for row in existing:
        session.delete(row)
    session.commit()

    rec = EmailRecoveryToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=30),
    )
    session.add(rec)
    session.commit()

    recovery_link = f"sapot://auth/email-recovery?t={token}"
    background_tasks.add_task(
        send_email,
        user.email,
        "Sapot Account Recovery",
        f"Click the link to recover your account: {recovery_link}\n\nThis link expires in 30 minutes.",
    )
    return {"message": "Recovery email sent if account exists."}


@router.get("/email-recovery/verify")
@limiter.limit("5/minute")
def verify_email_recovery(
    request: Request,
    t: str,
    session: SessionDep,
):
    token_hash = hashlib.sha256(t.encode()).hexdigest()
    rec = session.exec(
        select(EmailRecoveryToken).where(EmailRecoveryToken.token_hash == token_hash)
    ).first()
    if not rec:
        raise HTTPException(status_code=403, detail="Invalid recovery token")
    if rec.used:
        raise HTTPException(status_code=403, detail="Token already used")
    if rec.expires_at < datetime.utcnow():
        raise HTTPException(status_code=403, detail="Token expired")

    rec.used = True
    session.add(rec)
    session.commit()

    expires_at = datetime.utcnow() + timedelta(minutes=15)
    result = create_recovery_session(session, rec.user_id, "email", expires_at)
    return {"recovery_token": result["raw_token"], "user_id": str(rec.user_id)}
