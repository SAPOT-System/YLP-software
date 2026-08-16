"""
database.py
───────────
MariaDB-backed persistence for the SAPOT SMS relay.

Two categories of tables
─────────────────────────
  SHARED  (defined by your main SAPOT API, relay reads/writes them)
    user                    — registered accounts; relay looks up phone numbers
    conversation            — relay creates one per SMS relay session
    conversationparticipant — relay adds sender + server bot as participants
    message                 — relay writes each forwarded message here

  RELAY-ONLY  (owned by this service, invisible to the main API)
    sms_session             — per-number conversation stage + current target
    sms_log                 — every SMS in/out with delivery status
    sms_unregistered_warning — numbers that received the registration warning

Engine is created once at startup via init().
All public functions are thread-safe (SQLAlchemy handles connection pooling).
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from datetime import datetime
import logging
import time
import uuid
from enum import Enum
from typing import List, Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, Enum as SAEnum,
    ForeignKey, String, Text, UniqueConstraint, text,
)
from sqlalchemy import create_engine, select, update, insert 
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker
from sqlalchemy.dialects.mysql import CHAR
import uuid

from sqlalchemy.dialects.mysql import CHAR
from sqlalchemy.types import TypeDecorator

# Same namespace as uuid.URL
NAMESPACE = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")


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
    return uuid.uuid5(NAMESPACE, name).hex


logger = logging.getLogger("sapot.db")

# ── Engine (set by init()) ────────────────────────────────────────────────────
_engine = None
_Session = None


def init(db_url: str):
    global _engine, _Session
    _engine = create_engine(
        db_url,
        pool_pre_ping=True,       # reconnect silently if connection dropped
        pool_recycle=1800,        # recycle connections every 30 min
        pool_size=5,
        max_overflow=10,
        echo=False,
    )
    _Session = sessionmaker(bind=_engine, expire_on_commit=False)

    # Only create relay-owned tables; shared tables already exist
    Base.metadata.create_all(_engine, tables=[
        SmsSession.__table__,
        SmsLog.__table__,
        SmsUnregisteredWarning.__table__,
    ])
    logger.info("Database ready: %s", db_url.split("@")[-1])  # hide credentials


def new_get_session() -> Session:
    return _Session()


def get_user_by_phone(phone:str):
    with new_get_session() as s:
        row = s.execute(
            select(User).where(User.phone_number == phone)
        ).scalar_one_or_none()
        if row is None:
            return None
        return {
            "id":           str(row.id),
            "phone":        row.phone_number,
            "username":     row.username,
            "first_name":   row.first_name,
            "last_name":    row.last_name,
            "email":        row.email,
            'banned': bool(row.banned),
            "phone_is_verified": bool(row.phone_is_verified),
            "app_active":   True,   # presence in DB = active account
        }

# =============================================================================
# BASE
# =============================================================================

class Base(DeclarativeBase):
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)


def new_id() -> str:
    """32-char UUID (NO dashes)"""
    return uuid.uuid4().hex


# =============================================================================
# ENUMS
# =============================================================================

class MessageType(str, Enum):
    text = "text"
    file = "file"
    call_log = "call_log"
    sms = "sms"


class ConversationType(str, Enum):
    direct = "direct"
    solo = "solo"


# =============================================================================
# MIXIN
# =============================================================================

class SyncableMixin:
    created_at = Column(BigInteger, default=_now_ms, nullable=False)
    updated_at = Column(BigInteger, default=_now_ms, onupdate=_now_ms, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)


# =============================================================================
# USER
# =============================================================================

class User(Base):
    __tablename__ = "user"
    __table_args__ = {"extend_existing": True}

    id = Column(String(32), primary_key=True, default=new_id, index=True)

    username = Column(String(50), nullable=False, unique=True, index=True)
    first_name = Column(String(50), nullable=False, index=True)
    last_name = Column(String(50), nullable=False, index=True)

    phone_number = Column(String(20), unique=True, nullable=True)
    email = Column(String(255), unique=True, nullable=True)

    hashed_password = Column(String(255), nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)

    conversation_participants = relationship(
        "ConversationParticipant",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    messages = relationship(
        "Message",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    banned = relationship(
        "BannedUser",
        back_populates="user",
        cascade="all, delete-orphan",
    )


    phone_is_verified = relationship(
        "PhoneVerified",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class PhoneVerified(Base):
    __tablename__ = "phone_verified"
    __table_args__ = {"extend_existing": True}

    id = Column(
        String(32),
        primary_key=True,
        default=new_id,
        index=True,
    )

    user_id = Column(
        String(32),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )

    user = relationship(
        "User",
        back_populates="phone_is_verified",
    )


# =============================================================================
# CONVERSATION
# =============================================================================

class Conversation(Base, SyncableMixin):
    __tablename__ = "conversation"
    __table_args__ = {"extend_existing": True}

    id = Column(String(32), primary_key=True, default=new_id, index=True)

    title = Column(String(100), nullable=False)

    conversation_type = Column(SAEnum(ConversationType), nullable=False)

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )

    conversationparticipants = relationship(
        "ConversationParticipant",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )


# =============================================================================
# CONVERSATION PARTICIPANT
# =============================================================================

class ConversationParticipant(Base, SyncableMixin):
    __tablename__ = "conversationparticipant"
    __table_args__ = {"extend_existing": True}

    id = Column(String(32), primary_key=True, default=new_id, index=True)

    conversation_id = Column(
        String(32),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    user_id = Column(
        String(32),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    joined_at = Column(BigInteger, default=_now_ms, nullable=False)

    user = relationship("User", back_populates="conversation_participants")

    conversation = relationship(
        "Conversation",
        back_populates="conversationparticipants",
    )


# =============================================================================
# MESSAGE
# =============================================================================

class Message(Base, SyncableMixin):
    __tablename__ = "message"
    __table_args__ = {"extend_existing": True}

    id = Column(String(32), primary_key=True, default=new_id, index=True)

    message_type = Column(
        SAEnum(MessageType),
        default=MessageType.text,
        nullable=False,
    )

    content = Column(String(255), nullable=False)

    conversation_id = Column(
        String(32),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=True,
    )

    sender_id = Column(
        String(32),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=True,
    )

    user = relationship("User", back_populates="messages")

    conversation = relationship("Conversation", back_populates="messages")


class BannedUser(Base):
    __tablename__ = "banneduser"
    __table_args__ = {"extend_existing": True}

    id = Column(
        String(32),
        primary_key=True,
        default=new_id,
        index=True,
    )

    user_id = Column(
        String(32),
        ForeignKey("user.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    until = Column(
        DateTime(timezone=True),
        nullable=False,
        index=True,
    )

    user = relationship(
        "User",
        back_populates="banned",
    )


    user = relationship("User", back_populates="banned")
# =============================================================================
# RELAY ONLY TABLES
# =============================================================================

class SmsSession(Base):
    __tablename__ = "sms_session"

    phone = Column(String(20), primary_key=True)
    stage = Column(String(20), default="NEW", nullable=False)
    target_phone = Column(String(20), nullable=True)
    target_username = Column(String(50), nullable=True)
    last_seen = Column(BigInteger, default=_now_ms, onupdate=_now_ms, nullable=False)


class SmsLog(Base):
    __tablename__ = "sms_log"

    id = Column(String(32), primary_key=True, default=new_id)

    direction = Column(String(3), nullable=False)
    from_number = Column(String(20), nullable=False)
    to_number = Column(String(20), nullable=False)

    body = Column(Text, nullable=False)

    status = Column(String(10), default="pending", nullable=False)
    failure_reason = Column(String(100), nullable=True)

    created_at = Column(BigInteger, default=_now_ms, nullable=False)


class SmsUnregisteredWarning(Base):
    __tablename__ = "sms_unregistered_warning"

    phone = Column(String(20), primary_key=True)
    warned_at = Column(BigInteger, default=_now_ms, nullable=False)

# =============================================================================
# USER LOOKUPS  (reads from shared `user` table)
# =============================================================================

def lookup_number(phone: str) -> Optional[dict]:
    """
    Look up a user by phone number in the shared `user` table.
    Returns a plain dict or None.
    """
    with new_get_session() as s:
        row = s.execute(
            select(User).where(User.phone_number == phone).where(~User.banned.any())
        ).scalar_one_or_none()
        if row is None:
            return None
        return {
            "id":           str(row.id),
            "phone":        row.phone_number,
            "username":     row.username,
            "first_name":   row.first_name,
            "last_name":    row.last_name,
            "email":        row.email,
            "app_active":   True,   # presence in DB = active account
        }


def get_all_users() -> list[dict]:
    with new_get_session() as s:
        rows = s.execute(
            select(User).order_by(User.username)
        ).scalars().all()
        return [{
            "id":         str(r.id),
            "username":   r.username,
            "first_name": r.first_name,
            "last_name":  r.last_name,
            "phone":      r.phone_number,
            "email":      r.email,
        } for r in rows]


# =============================================================================
# SESSION MANAGEMENT  (relay-only sms_session table)
# =============================================================================

def has_unregistered_warning(phone: str) -> bool:
    with new_get_session() as s:
        return s.get(SmsUnregisteredWarning, phone) is not None


def mark_unregistered_warning(phone: str):
    with new_get_session() as s:
        if s.get(SmsUnregisteredWarning, phone) is None:
            s.add(SmsUnregisteredWarning(phone=phone))
            s.commit()

def get_session_data(phone: str) -> dict:
    """Return session row for `phone`, creating it if absent."""
    with new_get_session() as s:
        row = s.get(SmsSession, phone)
        if row is None:
            row = SmsSession(phone=phone, stage="NEW")
            s.add(row)
            s.commit()
            s.refresh(row)
        else:
            row.last_seen = _now_ms()
            s.commit()
        return {
            "phone":           row.phone,
            "stage":           row.stage,
            "target_phone":    row.target_phone,
            "target_username": row.target_username,
        }


def update_session_data(phone: str, **kwargs):
    allowed = {"stage", "target_phone", "target_username"}
    fields  = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    fields["last_seen"] = _now_ms()
    with new_get_session() as s:
        s.execute(
            update(SmsSession).where(SmsSession.phone == phone).values(**fields)
        )
        s.commit()


def reset_session_data(phone: str):
    with new_get_session() as s:
        s.execute(
            update(SmsSession)
            .where(SmsSession.phone == phone)
            .values(stage="NEW", target_phone=None,
                    target_username=None, last_seen=_now_ms())
        )
        s.commit()


def get_all_sessions() -> list[dict]:
    with new_get_session() as s:
        rows = s.execute(
            select(SmsSession).order_by(SmsSession.last_seen.desc())
        ).scalars().all()
        return [{
            "phone":           r.phone,
            "stage":           r.stage,
            "target_phone":    r.target_phone,
            "target_username": r.target_username,
            "last_seen":       r.last_seen,
        } for r in rows]


# =============================================================================
# SMS LOG  (relay-only sms_log table)
# =============================================================================

def log_message(direction: str, from_number: str, to_number: str,
                body: str, status: str = "pending") -> str:
    """Insert a log row and return its UUID string."""
    row = SmsLog(
        direction=direction,
        from_number=from_number,
        to_number=to_number,
        body=body,
        status=status,
    )
    with new_get_session() as s:
        s.add(row)
        s.commit()
        return str(row.id)


def update_message_status(msg_id: str, status: str,
                           failure_reason: Optional[str] = None):
    with new_get_session() as s:
        s.execute(
            update(SmsLog)
            .where(SmsLog.id == msg_id)
            .values(status=status, failure_reason=failure_reason)
        )
        s.commit()


def fail_orphaned_pending_messages() -> int:
    with new_get_session() as s:
        result = s.execute(
            update(SmsLog)
            .where(SmsLog.status == "pending")
            .values(status="failed", failure_reason="SERVICE_CRASHED")
        )
        s.commit()
        return result.rowcount


def get_messages(limit: int = 50, offset: int = 0, direction: Optional[str] = None,
                 phone: Optional[str] = None) -> dict:
    with new_get_session() as s:
        q = select(SmsLog)
        if direction:
            q = q.where(SmsLog.direction == direction)
        if phone:
            q = q.where(
                (SmsLog.from_number == phone) | (SmsLog.to_number == phone)
            )
        
        # Get total count before limiting
        total = s.execute(select(func.count()).select_from(SmsLog).where(
            (SmsLog.direction == direction if direction else True) and
            ((SmsLog.from_number == phone) | (SmsLog.to_number == phone) if phone else True)
        )).scalar()
        
        q = q.order_by(SmsLog.created_at.desc()).offset(offset).limit(limit)
        rows = s.execute(q).scalars().all()
        
        return {
            "messages": [{
                "id":             str(r.id),
                "direction":      r.direction,
                "from_number":    r.from_number,
                "to_number":      r.to_number,
                "body":           r.body,
                "status":         r.status,
                "failure_reason": r.failure_reason,
                "created_at":     r.created_at,
            } for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset
        }


# =============================================================================
# APP FORWARD  —  write message into shared Conversation + Message tables
# so the forwarded SMS appears inside the SAPOT app natively
# =============================================================================

# UUID of the "SMS Bot" user in your system.
# Create this user once in your main API and paste the UUID here,
# or set the SMS_BOT_USER_ID environment variable.
import os
import requests as _requests

SAPOT_URL: str = os.environ.get("SAPOT_API_URL", "http://localhost:8000")
GSM_SECRET: str = os.environ.get("GSM_SECRET", "")
SMS_BOT_USER_ID: Optional[str] = os.environ.get("SMS_BOT_USER_ID")


def notify_app(sender_phone: str, target_phone: str, body: str) -> bool:
    """
    Deliver the forwarded SMS to the target user via the SAPOT server.

    Calls POST /gsm/inbound on the SAPOT server, which persists the message
    to the database and pushes it to the target user's active WebSocket
    connection. Direct DB writes are intentionally avoided here to prevent
    duplicate records and to ensure WebSocket delivery actually fires.
    """
    try:
        r = _requests.post(
            f"{SAPOT_URL}/gsm/inbound",
            json={
                "sender_phone": sender_phone,
                "target_phone": target_phone,
                "body": body,
            },
            headers={"X-GSM-Secret": GSM_SECRET},
            timeout=10,
        )
        if r.status_code == 200:
            data = r.json()
            logger.info(
                "notify_app: message delivered (sender=%s target=%s message_id=%s)",
                sender_phone, target_phone, data.get("message_id"),
            )
            return True
        logger.error(
            "notify_app: server returned %s (sender=%s target=%s body=%r)",
            r.status_code, sender_phone, target_phone, r.text[:200],
        )
        return False
    except Exception as e:
        logger.error("notify_app failed: %s", e, exc_info=True)
        return False


# =============================================================================
# BACKWARDS COMPATIBILITY
# sms_handler.py still expects old function names
# =============================================================================

def get_session(phone: str) -> dict:
    return get_session_data(phone)


def update_session(phone: str, **kwargs):
    return update_session_data(phone, **kwargs)


def reset_session(phone: str):
    return reset_session_data(phone)
