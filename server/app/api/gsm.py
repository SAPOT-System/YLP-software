import logging
import os
from typing import Annotated
from uuid import UUID, uuid4, uuid5
from fastapi import Depends, HTTPException, Query, Request
from fastapi.routing import APIRouter
import time

from pydantic import BaseModel
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.connection_manager import manager
from app.db_operations.token import get_current_user, get_current_user_admin, get_current_user_rescuer, verify_reauth_token
from app.models.conversation import Conversation, ConversationParticipant, ConversationType
from app.models.guest import Guest
from app.models.message import Message, MessageType
from app.models.message_receipt import MessageReceipt, StatusType
from app.models.phone_verification import PhoneVerification, PhoneVerified, RequestPhoneVerification, VerifyPhoneCode, generate_otp, now_ms
from app.models.queued import Queue
from app.models.users import PhoneStr, User
import httpx
import json

# Module-level client reuses TCP connections to localhost:8001 across requests.
# The 120s timeout matches the SMS send worst-case; health checks are much faster.
_gsm_http_client: httpx.AsyncClient | None = None
logger = logging.getLogger("app")

GSM_SECRET = os.environ.get("GSM_SECRET")
if not GSM_SECRET:
    raise RuntimeError("GSM_SECRET environment variable is not set")


def _get_gsm_client() -> httpx.AsyncClient:
    global _gsm_http_client
    if _gsm_http_client is None or _gsm_http_client.is_closed:
        _gsm_http_client = httpx.AsyncClient(
            base_url="http://localhost:8001",
            timeout=120.0,
            limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
        )
    return _gsm_http_client


def _gsm_log_extra(current_user: User | None, path: str) -> dict:
    return {
        "user_id": str(current_user.id) if current_user else "ANONYMOUS",
        "action": "gsm_health_unavailable",
        "entity_id": None,
        "metadata_json": {"path": path},
    }


async def _get_gsm_health(path: str, current_user: User) -> dict:
    try:
        response = await _get_gsm_client().get(path)
    except httpx.RequestError as exc:
        logger.warning(
            "GSM gateway health check unavailable: %s",
            exc,
            extra=_gsm_log_extra(current_user, path),
        )
        raise HTTPException(status_code=503, detail="GSM gateway is unavailable") from exc

    return response.json()


class InboundSMSPayload(BaseModel):
    sender_phone: str
    target_phone: str
    body: str


def _gsm_secret_ok(request: Request) -> bool:
    return request.headers.get("X-GSM-Secret") == GSM_SECRET


def _create_sms_conversation(session, convo_id: UUID, user_a_id: UUID, user_b_id: UUID) -> Conversation:
    convo = Conversation(id=convo_id, title=str(convo_id), conversation_type=ConversationType.sms)
    p1 = ConversationParticipant(user_id=user_a_id, conversation_id=convo_id)
    p2 = ConversationParticipant(user_id=user_b_id, conversation_id=convo_id)
    session.add_all([convo, p1, p2])
    session.commit()
    return convo


router = APIRouter(
    prefix='/gsm',
    tags=['gsm'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("/users/by-phone/{phone}")
def user_by_phone(
    phone: str,
    request: Request,
    session: SessionDep,
):
    """Internal endpoint for GSM-API to look up a registered user by phone number."""
    if not _gsm_secret_ok(request):
        raise HTTPException(403)

    user = session.exec(select(User).where(User.phone_number == phone)).first()
    if not user:
        raise HTTPException(404, "User not found")
    return {"user_id": str(user.id), "username": user.username}


@router.post("/inbound")
async def inbound_sms(
    payload: InboundSMSPayload,
    request: Request,
    session: SessionDep,
):
    """Internal endpoint: receives an inbound SMS from the GSM-API and delivers it to the target user via WebSocket."""
    if not _gsm_secret_ok(request):
        raise HTTPException(403)

    sender = session.exec(select(User).where(User.phone_number == payload.sender_phone)).first()
    target = session.exec(select(User).where(User.phone_number == payload.target_phone)).first()

    if not sender or not target:
        raise HTTPException(404, "User not found")

    # Look up the existing conversation where both users are participants
    conversation = session.exec(
        select(Conversation)
        .join(ConversationParticipant, Conversation.id == ConversationParticipant.conversation_id)
        .where(ConversationParticipant.user_id == sender.id)
        .where(
            Conversation.id.in_(
                select(ConversationParticipant.conversation_id)
                .where(ConversationParticipant.user_id == target.id)
            )
        )
    ).first()
    print("senderid", sender.id)
    print("targetId", target.id)

    if not conversation:
        convo_id = UUID(sms_conversation_id(str(sender.id), str(target.id)))
        conversation = _create_sms_conversation(session, convo_id, sender.id, target.id)

    convo_id = conversation.id
    print("convoid", convo_id)

    msg = Message(
        conversation_id=convo_id,
        sender_id=sender.id,
        content=payload.body,
        message_type=MessageType.sms,
    )
    session.add(msg)
    session.flush()  # get msg.id before commit

    receipt = MessageReceipt(
        message_id=msg.id,
        user_id=target.id,
        status=StatusType.delivered,
    )
    session.add(receipt)
    session.commit()
    session.refresh(msg)

    is_connected = await manager.is_user_connected(target.id)
    print(f"[gsm/inbound] sender={sender.username} target={target.username} connected={is_connected} msg_id={msg.id}")

    ws_payload = {
        "type": "chat",
        "data": {
            "from": str(sender.id),
            "to": str(target.id),
            "message": payload.body,
            "conversationId": str(convo_id),
            "messageId": str(msg.id),
            "sentAt": msg.created_at,
            "messageType": "sms",
            "senderProfile": {
                "username": sender.username,
                "firstName": sender.first_name,
                "lastName": sender.last_name,
            },
        }
    }

    if is_connected:
        await manager.send_personal_message(target.id, ws_payload)
    else:
        q = Queue(
            id=uuid4(),
            to=target.id,
            payload_type="chat",
            data=json.dumps(ws_payload, default=str),
            data_id=str(msg.id),
        )
        session.add(q)
        session.commit()

    return {"ok": True, "message_id": str(msg.id)}


@router.get("/health")
async def gsm_health(
        current_user : Annotated[User, Depends(get_current_user)],
        ):
    return await _get_gsm_health("/health", current_user)


@router.get("/health/detailed")
async def gsm_health_detailed(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        ):
    """Admin only"""
    return await _get_gsm_health("/health/detailed", current_user)


@router.get("/sms/messages")
async def gsm_messages(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        limit: int = 25,
        offset: int = 0,
        direction: str|None = None,
        phone: str|None = None
        ):
    """Admin only"""
    params: dict = {"limit": limit, "offset": offset}
    if direction:
        params["direction"] = direction
    if phone:
        params["phone"] = phone

    client = _get_gsm_client()
    response = await client.get("/sms/messages", params=params)
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


    return await sendToModule(target.phone_number, message)


async def sendToModule(phone_number: str, message: str):
    client = _get_gsm_client()
    response = await client.post(
        "/sms/send",
        json={"number": phone_number, "body": f"FROM {phone_number}: " + message},
    )
    return response.json()

@router.post("/request")
async def request_phone_verification(
    data: RequestPhoneVerification,
    request: Request,
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Send a 6-digit verification code to user phone.
    """
    if data.phone_number and data.phone_number != current_user.phone_number:
        verify_reauth_token(request)

    target_phone = data.phone_number or current_user.phone_number

    if not target_phone:
        raise HTTPException(404, "phone number does not exist")

    # generate code
    code = generate_otp()

    # expires in 5 minutes
    expires_at = now_ms() + (5 * 60 * 1000)

    verification = PhoneVerification(
        user_id=current_user.id,
        phone_number=target_phone,
        verification_code=code,
        expires_at=expires_at,
    )

    session.add(verification)
    session.commit()

    # send SMS
    await sendToModule(
        target_phone,
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
    verification = session.exec(
        select(PhoneVerification)
        .where(
            PhoneVerification.user_id == current_user.id
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

    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(404, "User not found")

    # Update phone number if it's different.
    # If a ghost user was created for this number via contactUnknownUser, clear
    # their phone_number first to avoid hitting the unique-key constraint.
    if verification.phone_number:
        ghost = session.exec(
            select(User)
            .join(Guest, Guest.user_id == User.id)
            .where(User.phone_number == verification.phone_number)
            .where(User.id != user.id)
        ).first()
        if ghost:
            ghost.phone_number = None
            session.add(ghost)
            session.flush()
        user.phone_number = verification.phone_number

    # verify phone
    # Delete old verified records for this user
    stmt = select(PhoneVerified).where(PhoneVerified.user_id == user.id)
    old_verified = session.exec(stmt)
    for record in old_verified:
        session.delete(record)

    is_verified = PhoneVerified(
            user_id=user.id
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
    # Find the latest verification attempt to get the phone number
    latest_verification = session.exec(
        select(PhoneVerification)
        .where(PhoneVerification.user_id == current_user.id)
        .order_by(PhoneVerification.created_at.desc())
    ).first()

    target_phone = latest_verification.phone_number if latest_verification else current_user.phone_number

    if not target_phone:
        raise HTTPException(404, "phone number does not exist")

    code = generate_otp()

    verification = PhoneVerification(
        user_id=current_user.id,
        phone_number=target_phone,
        verification_code=code,
        expires_at=now_ms() + (5 * 60 * 1000),
    )

    session.add(verification)
    session.commit()

    await sendToModule(
        target_phone,
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


@router.post("/migrate-phone-user")
def migrate_phone_user(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    """
    After a user verifies their phone number, call this endpoint to migrate any
    ghost/unknown user that was previously created for that phone number into the
    real account. Reassigns conversation participants and messages, upgrades or
    merges SMS conversations, then deletes the ghost user.
    """
    phone = current_user.phone_number
    if not phone:
        raise HTTPException(400, "No phone number on account")

    # Derive the ghost ID deterministically — verify_phone_code already cleared
    # ghost.phone_number, so a phone-number lookup would miss. The ghost ID is
    # always direct_conversation_id(phone, NAMESPACE.hex), matching contact_unknown_user.
    ghost_id_hex = direct_conversation_id(phone, str(NAMESPACE.hex))
    ghost_id = UUID(ghost_id_hex)
    ghost = session.get(User, ghost_id)
    guest_record = session.exec(select(Guest).where(Guest.user_id == ghost_id)).first()

    if not ghost or not guest_record:
        return {"migrated": False, "detail": "No ghost user found for this phone number"}

    # --- Step 1: snapshot SMS conversations BEFORE mutating participant rows ---
    # The participant loop below reassigns user_id in-place, so we must collect
    # SMS conversations while ghost_id is still on the rows.
    ghost_participants_all = session.exec(
        select(ConversationParticipant).where(ConversationParticipant.user_id == ghost_id)
    ).all()

    sms_targets = []  # list of (sms_conversation, other_user_id)
    for gp in ghost_participants_all:
        convo = session.get(Conversation, gp.conversation_id)
        if convo and convo.conversation_type == ConversationType.sms:
            other = session.exec(
                select(ConversationParticipant)
                .where(ConversationParticipant.conversation_id == gp.conversation_id)
                .where(ConversationParticipant.user_id != ghost_id)
            ).first()
            if other:
                sms_targets.append((convo, other.user_id))

    # --- Step 2: reassign conversation participants ghost → current user ---
    for gp in ghost_participants_all:
        already_participant = session.exec(
            select(ConversationParticipant)
            .where(ConversationParticipant.conversation_id == gp.conversation_id)
            .where(ConversationParticipant.user_id == current_user.id)
        ).first()
        if already_participant:
            session.delete(gp)
        else:
            gp.user_id = current_user.id
            session.add(gp)

    # --- Step 3: reassign messages sent by the ghost user ---
    ghost_messages = session.exec(
        select(Message).where(Message.sender_id == ghost_id)
    ).all()
    for msg in ghost_messages:
        msg.sender_id = current_user.id
        session.add(msg)

    # --- Step 4: upgrade or merge each SMS conversation ---
    for sms_convo, other_user_id in sms_targets:
        direct_id = UUID(direct_conversation_id(str(current_user.id), str(other_user_id)))
        existing_direct = session.get(Conversation, direct_id)

        if existing_direct is None:
            # Case A: no direct conversation yet — upgrade in-place.
            sms_convo.conversation_type = ConversationType.direct
            session.add(sms_convo)
        else:
            # Case B: direct conversation exists — move messages there, soft-delete SMS thread.
            sms_messages = session.exec(
                select(Message).where(Message.conversation_id == sms_convo.id)
            ).all()
            for msg in sms_messages:
                msg.conversation_id = existing_direct.id
                session.add(msg)
            session.add(existing_direct)   # bump updated_at so mobile sync picks it up
            sms_convo.is_deleted = True
            session.add(sms_convo)

    # --- Step 5: delete ghost (cascades Guest, PhoneVerified, etc.) and commit ---
    session.delete(ghost)
    session.commit()

    return {"migrated": True, "ghost_user_id": str(ghost_id)}


# Same namespace as uuid.URL
NAMESPACE = UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")


def direct_conversation_id(user_id_a: str, user_id_b: str):
    """
    Generate a deterministic conversation ID
    regardless of user order.

    Example:
        direct_conversation_id("alice", "bob")
        ==
        direct_conversation_id("bob", "alice")
    """
    name = ":".join(sorted([user_id_a, user_id_b]))
    return uuid5(NAMESPACE, name).hex


def sms_conversation_id(user_id_a: str, user_id_b: str) -> str:
    """
    Generate a deterministic SMS conversation ID distinct from direct_conversation_id
    for the same peer pair. Mirrors the mobile client's smsConversationId():
        uuid.v5("sms:" + sorted([userIdA, userIdB]).join(":"), uuid.URL)
    """
    name = "sms:" + ":".join(sorted([user_id_a, user_id_b]))
    return uuid5(NAMESPACE, name).hex



@router.post("/contact-unknown-user")
async def contact_unknown_user(
    current_user : Annotated[User, Depends(get_current_user)],
    target_phone_number: Annotated[str, Query(pattern=r"^\+639\d{9}$")],
    session: SessionDep,

    ):
    """
    this is an endpoint for contacting unknown users. Use this to create
    the conversation between an authenticated user and a user without an account.
    This does not send any message to the target user.
    """
    registered_user = session.exec(select(User).where(User.phone_number == target_phone_number)).first()

    if registered_user:
        target_user_id = str(registered_user.id)
        convo_type = ConversationType.direct
    else:
        target_user_id = direct_conversation_id(target_phone_number, str(NAMESPACE.hex))
        convo_type = ConversationType.sms

        unknown_user_exists = session.get(User, UUID(target_user_id))
        if not unknown_user_exists:
            createUser = User(
                    id=UUID(target_user_id),
                    username=target_phone_number,
                    phone_number=target_phone_number,
                    first_name="Unknown",
                    last_name="Unknown",
                    hashed_password=""
                    )
            guest = Guest(user_id=UUID(target_user_id))
            verify_phone = PhoneVerified(user_id=UUID(target_user_id))
            session.add_all([createUser, guest, verify_phone])

    # For registered peers use the shared direct_conversation_id; for unknown
    # (SMS-only) peers use sms_conversation_id so the ID matches what the mobile
    # client computes in getOrCreateSmsConversationByPeer.
    if registered_user:
        conversation_id = direct_conversation_id(target_user_id, str(current_user.id))
    else:
        conversation_id = sms_conversation_id(target_user_id, str(current_user.id))

    conversation = session.get(Conversation, UUID(conversation_id))

    if not conversation:
        convo = Conversation(
                id=UUID(conversation_id),
                title=conversation_id,
                conversation_type=convo_type,
                )
        session.add(convo)

    participant_1 = session.exec(
            select(ConversationParticipant)
                .where(ConversationParticipant.user_id==UUID(target_user_id))
                .where(ConversationParticipant.conversation_id == UUID(conversation_id))
                ).first()
    participant_2 = session.exec(
            select(ConversationParticipant).where(ConversationParticipant.user_id==current_user.id)
                .where(ConversationParticipant.conversation_id == UUID(conversation_id))
                ).first()

    if not participant_1:
        session.add(ConversationParticipant(
                user_id=UUID(target_user_id),
                conversation_id=UUID(conversation_id)
                ))
    if not participant_2:
        session.add(ConversationParticipant(
                user_id=current_user.id,
                conversation_id=UUID(conversation_id)
                ))

    session.commit()

    if not registered_user:
        await sendToModule(target_phone_number, f"Hello {target_phone_number}. This is from SAPOT. User {current_user.username} enabled you to message to this SMS relay!")

    # Normalize to hyphenated UUID string so it matches str(user.id) everywhere
    # else (inbound WS payload, sms_conversation_id calls). Without this, the
    # mobile receives a 32-char hex string (no hyphens) while every other server
    # path uses 36-char hyphenated UUIDs, causing uuid5 to compute a different
    # conversation ID for the same peer pair.
    return {
        "status": "ok",
        "detail": "Sync from the database",
        "user_id": str(UUID(target_user_id)),
        "is_sapot_user": bool(registered_user),
    }


# MOCK ###############################################

@router.get("/mock/health")
async def MOCK_gsm_health(
        current_user : Annotated[User, Depends(get_current_user)],
        ):
    return {
            "status": "ok",
            "gsm_ready": True,
            "connected": True,
            "detail": "network OK"
            }


@router.get("/mock/health/detailed")
async def MOCK_gsm_health_detailed(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        ):
    """Admin only"""
    return "Admin only!"


@router.get("/mock/sms/messages")
async def MOCK_gsm_messages(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        limit=50,
        direction=None,
        phone=None
        ):
    """Admin only"""
    return "Admin only!"

@router.post("/mock/sms/send")
async def MOCK_send_sms(
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


    return await MOCK_sendToModule(target.phone_number, message)




async def MOCK_sendToModule(phone_number: str, message: str):
    print(f"FROM {phone_number}: {message}")
    return { 
            "ok": True,
            "msg_id": "5b60a09c496a4c5c9563b43604da28f9",
            "to": phone_number
            }

@router.post("/mock/request")
async def MOCK_request_phone_verification(
    data: RequestPhoneVerification,
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Send a 6-digit verification code to user phone.
    """
    target_phone = data.phone_number or current_user.phone_number

    if not target_phone:
        raise HTTPException(404, "phone number does not exist")

    # generate code
    code = generate_otp()

    # expires in 5 minutes
    expires_at = now_ms() + (5 * 60 * 1000)

    verification = PhoneVerification(
        user_id=current_user.id,
        phone_number=target_phone,
        verification_code=code,
        expires_at=expires_at,
    )

    session.add(verification)
    session.commit()

    # send SMS
    await MOCK_sendToModule(
        target_phone,
        f"SAPOT verification code: {code}"
    )

    return {
        "detail": "Verification code sent."
    }


# =============================================================================
# VERIFY CODE
# =============================================================================

@router.post("/mock/verify")
def MOCK_verify_phone_code(
    data: VerifyPhoneCode,
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Verify submitted OTP code.
    """
    verification = session.exec(
        select(PhoneVerification)
        .where(
            PhoneVerification.user_id == current_user.id
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

    user = session.get(User, current_user.id)
    if not user:
        raise HTTPException(404, "User not found")

    # Update phone number if it's different.
    # Clear the number from any ghost user first to avoid a unique-key conflict.
    if verification.phone_number:
        ghost = session.exec(
            select(User)
            .join(Guest, Guest.user_id == User.id)
            .where(User.phone_number == verification.phone_number)
            .where(User.id != user.id)
        ).first()
        if ghost:
            ghost.phone_number = None
            session.add(ghost)
            session.flush()
        user.phone_number = verification.phone_number

    # verify phone
    # Delete old verified records for this user
    stmt = select(PhoneVerified).where(PhoneVerified.user_id == user.id)
    old_verified = session.exec(stmt)
    for record in old_verified:
        session.delete(record)

    is_verified = PhoneVerified(
            user_id=user.id
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

@router.post("/mock/resend")
async def MOCK_resend_phone_code(
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep
):
    """
    Resend verification code.
    """
    # Find the latest verification attempt to get the phone number
    latest_verification = session.exec(
        select(PhoneVerification)
        .where(PhoneVerification.user_id == current_user.id)
        .order_by(PhoneVerification.created_at.desc())
    ).first()

    target_phone = latest_verification.phone_number if latest_verification else current_user.phone_number

    if not target_phone:
        raise HTTPException(404, "phone number does not exist")

    code = generate_otp()

    verification = PhoneVerification(
        user_id=current_user.id,
        phone_number=target_phone,
        verification_code=code,
        expires_at=now_ms() + (5 * 60 * 1000),
    )

    session.add(verification)
    session.commit()

    await MOCK_sendToModule(
        target_phone,
        f"SAPOT verification code: {code}"
    )

    return {
        "detail": "Verification code resent."
    }

@router.get("/mock/phone-is-verified")
def MOCK_check_if_verified(
    current_user : Annotated[User, Depends(get_current_user)],
    ):
    return { 'is_verified': bool(current_user.phone_is_verified) }


@router.post("/mock/migrate-phone-user")
def MOCK_migrate_phone_user(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    phone = current_user.phone_number
    if not phone:
        raise HTTPException(400, "No phone number on account")

    ghost_id_hex = direct_conversation_id(phone, str(NAMESPACE.hex))
    ghost_id = UUID(ghost_id_hex)
    ghost = session.get(User, ghost_id)
    guest_record = session.exec(select(Guest).where(Guest.user_id == ghost_id)).first()

    if not ghost or not guest_record:
        return {"migrated": False, "detail": "No ghost user found for this phone number"}

    ghost_participants_all = session.exec(
        select(ConversationParticipant).where(ConversationParticipant.user_id == ghost_id)
    ).all()

    sms_targets = []
    for gp in ghost_participants_all:
        convo = session.get(Conversation, gp.conversation_id)
        if convo and convo.conversation_type == ConversationType.sms:
            other = session.exec(
                select(ConversationParticipant)
                .where(ConversationParticipant.conversation_id == gp.conversation_id)
                .where(ConversationParticipant.user_id != ghost_id)
            ).first()
            if other:
                sms_targets.append((convo, other.user_id))

    for gp in ghost_participants_all:
        already_participant = session.exec(
            select(ConversationParticipant)
            .where(ConversationParticipant.conversation_id == gp.conversation_id)
            .where(ConversationParticipant.user_id == current_user.id)
        ).first()
        if already_participant:
            session.delete(gp)
        else:
            gp.user_id = current_user.id
            session.add(gp)

    ghost_messages = session.exec(
        select(Message).where(Message.sender_id == ghost_id)
    ).all()
    for msg in ghost_messages:
        msg.sender_id = current_user.id
        session.add(msg)

    for sms_convo, other_user_id in sms_targets:
        direct_id = UUID(direct_conversation_id(str(current_user.id), str(other_user_id)))
        existing_direct = session.get(Conversation, direct_id)

        if existing_direct is None:
            sms_convo.conversation_type = ConversationType.direct
            session.add(sms_convo)
        else:
            sms_messages = session.exec(
                select(Message).where(Message.conversation_id == sms_convo.id)
            ).all()
            for msg in sms_messages:
                msg.conversation_id = existing_direct.id
                session.add(msg)
            session.add(existing_direct)
            sms_convo.is_deleted = True
            session.add(sms_convo)

    session.delete(ghost)
    session.commit()

    return {"migrated": True, "ghost_user_id": str(ghost_id)}


# Same namespace as uuid.URL
NAMESPACE = UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")


def MOCK_direct_conversation_id(user_id_a: str, user_id_b: str):
    """
    Generate a deterministic conversation ID
    regardless of user order.

    Example:
        direct_conversation_id("alice", "bob")
        ==
        direct_conversation_id("bob", "alice")
    """
    name = ":".join(sorted([user_id_a, user_id_b]))
    return uuid5(NAMESPACE, name).hex



@router.post("/mock/contact-unknown-user")
async def MOCK_contact_unknown_user(
    current_user : Annotated[User, Depends(get_current_user)],
    target_phone_number: Annotated[str, Query(pattern=r"^\+639\d{9}$")],
    session: SessionDep,

    ):
    """
    this is an endpoint for contacting unknown users. Use this to create
    the conversation between an authenticated user and a user without an account.
    This does not send any message to the target user.
    """
    registered_user = session.exec(select(User).where(User.phone_number == target_phone_number)).first()

    if registered_user:
        target_user_id = str(registered_user.id)
        convo_type = ConversationType.direct
    else:
        target_user_id = direct_conversation_id(target_phone_number, str(NAMESPACE.hex))
        convo_type = ConversationType.sms

        unknown_user_exists = session.get(User, UUID(target_user_id))
        if not unknown_user_exists:
            createUser = User(
                    id=UUID(target_user_id),
                    username=target_phone_number,
                    phone_number=target_phone_number,
                    first_name="Unknown",
                    last_name="Unknown",
                    hashed_password=""
                    )
            guest = Guest(user_id=UUID(target_user_id))
            verify_phone = PhoneVerified(user_id=UUID(target_user_id))
            session.add_all([createUser, guest, verify_phone])

    if registered_user:
        conversation_id = direct_conversation_id(target_user_id, str(current_user.id))
    else:
        conversation_id = sms_conversation_id(target_user_id, str(current_user.id))

    conversation = session.get(Conversation, UUID(conversation_id))

    if not conversation:
        convo = Conversation(
                id=UUID(conversation_id),
                title=conversation_id,
                conversation_type=convo_type,
                )
        session.add(convo)

    participant_1 = session.exec(
            select(ConversationParticipant)
                .where(ConversationParticipant.user_id==UUID(target_user_id))
                .where(ConversationParticipant.conversation_id == UUID(conversation_id))
                ).first()
    participant_2 = session.exec(
            select(ConversationParticipant).where(ConversationParticipant.user_id==current_user.id)
                .where(ConversationParticipant.conversation_id == UUID(conversation_id))
                ).first()

    if not participant_1:
        session.add(ConversationParticipant(
                user_id=UUID(target_user_id),
                conversation_id=UUID(conversation_id)
                ))
    if not participant_2:
        session.add(ConversationParticipant(
                user_id=current_user.id,
                conversation_id=UUID(conversation_id)
                ))

    session.commit()

    if not registered_user:
        await MOCK_sendToModule(target_phone_number, f"Hello {target_phone_number}. This is from SAPOT. User {current_user.username} enabled you to message to this SMS relay!")

    return {
        "status": "ok",
        "detail": "Sync from the database",
        "user_id": str(UUID(target_user_id)),
        "is_sapot_user": bool(registered_user),
    }
