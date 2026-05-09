from typing import Annotated
from uuid import UUID
from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
import time

from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.token import get_current_user, get_current_user_admin, get_current_user_rescuer
from app.models.phone_verification import PhoneVerification, PhoneVerified, RequestPhoneVerification, VerifyPhoneCode, generate_otp, now_ms
from app.models.users import User
import httpx


router = APIRouter(
    prefix='/gsm',
    tags=['gsm'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("/health")
async def gsm_health(
        current_user : Annotated[User, Depends(get_current_user)],
        ):
    async with httpx.AsyncClient() as client:
        response = await client.get( "http://localhost:8001/health")
    return response.json()


@router.get("/health/detailed")
async def gsm_health_detailed(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        ):
    """Admin only"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8001/health/detailed",
        )

    return response.json()


@router.get("/sms/messages")
async def gsm_messages(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        limit=50,
        direction=None,
        phone=None
        ):
    """Admin only"""
    url = f"http://localhost:8001/sms/messages?limit={limit}"
    if direction:
        url += f"&direction={direction}"

    if phone:
        url += f"&phone={phone}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)

    return response.json()

@router.post("/sms/send")
async def send_sms(
        current_user : Annotated[User, Depends(get_current_user)],
        user_id: UUID, 
        message: str,
        session: SessionDep,
        ):

    if current_user.banned:
        raise HTTPException(403)

    target = session.get(User, user_id)

    if not target:
        return { "detail": { "msg": "This user does not exist." }}
    if not target.phone_number:
        return { "detail": { "msg": "This user does not have a phone number attached to his/her account." }}

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8001/sms/send",
            json={
                "to": target.phone_number,
                "message": message
            }
        )

    return response.json()


async def sendToModule(phone_number: str, message: str):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8001/sms/send",
            json={
                "number": phone_number,
                "body": message
            }
        )
    return response.json()

@router.post("/request")
async def request_phone_verification(
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Send a 6-digit verification code to user phone.
    """

    if not current_user.phone_number:
        raise HTTPException(404, "phone number does not exist")

    user = session.exec(
        select(User).where(
            User.phone_number == current_user.phone_number
        )
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Phone number not found."
        )

    # already verified
    if getattr(user, "phone_verified", False):
        raise HTTPException(
            status_code=400,
            detail="Phone already verified."
        )

    # generate code
    code = generate_otp()

    # expires in 5 minutes
    expires_at = now_ms() + (5 * 60 * 1000)

    verification = PhoneVerification(
        user_id=user.id,
        phone_number=current_user.phone_number,
        verification_code=code,
        expires_at=expires_at,
    )

    session.add(verification)
    session.commit()

    # send SMS
    await sendToModule(
        current_user.phone_number,
        f"SAPOT verification code: {code}"
    )

    return {
        "detail": "Verification code sent."
    }


# =============================================================================
# VERIFY CODE
# =============================================================================

@router.post("/verify")
def verify_phone_code(
    data: VerifyPhoneCode,
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Verify submitted OTP code.
    """
    if not current_user.phone_number:
        raise HTTPException(404, "phone number does not exist")

    user = session.exec(
        select(User).where(
            User.phone_number == current_user.phone_number
        )
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    verification = session.exec(
        select(PhoneVerification)
        .where(
            PhoneVerification.user_id == user.id
        )
        .where(
            PhoneVerification.phone_number == current_user.phone_number
        )
        .where(
            PhoneVerification.verification_code == data.code
        )
        .where(
            PhoneVerification.is_used == False
        )
        .order_by(
            PhoneVerification.created_at.desc()
        )
    ).first()

    if not verification:
        raise HTTPException(
            status_code=400,
            detail="Invalid verification code."
        )

    # expired
    if verification.expires_at < now_ms():
        raise HTTPException(
            status_code=400,
            detail="Verification code expired."
        )

    # mark used
    verification.is_used = True

    if not current_user.id:
        raise HTTPException(404, "User not found")

    # verify phone
    is_verified = PhoneVerified(
            user_id=current_user.id
            )

    session.add(verification)
    session.add(is_verified)
    session.add(user)

    session.commit()

    return {
        "detail": "Phone verified successfully."
    }


# =============================================================================
# RESEND CODE
# =============================================================================

@router.post("/resend")
async def resend_phone_code(
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Resend verification code.
    """

    if not current_user.phone_number:
        raise HTTPException(404, "phone number does not exist")

    user = session.exec(
        select(User).where(
            User.phone_number == current_user.phone_number
        )
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found."
        )

    if getattr(user, "phone_verified", False):
        raise HTTPException(
            status_code=400,
            detail="Phone already verified."
        )

    code = generate_otp()

    if not current_user.id:
        raise HTTPException(404, "User not found")


    verification = PhoneVerification(
        user_id=current_user.id,
        phone_number=current_user.phone_number,
        verification_code=code,
        expires_at=now_ms() + (5 * 60 * 1000),
    )

    session.add(verification)
    session.commit()

    await sendToModule(
        current_user.phone_number,
        f"SAPOT verification code: {code}"
    )

    return {
        "detail": "Verification code resent."
    }

@router.get("/phone-is-verified")
def check_if_verified(
    current_user : Annotated[User, Depends(get_current_user)],
    ):
    return { 'is_verified': bool(current_user.phone_is_verified) }
