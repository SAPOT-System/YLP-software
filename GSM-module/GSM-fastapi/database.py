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

Engine is created once at startup via init().
All public functions are thread-safe (SQLAlchemy handles connection pooling).
"""

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
    return uuid.uuid5(NAMESPACE, name)


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
    ])
    logger.info("Database ready: %s", db_url.split("@")[-1])  # hide credentials


def new_get_session() -> Session:
    return _Session()


# =============================================================================
# BASE
# =============================================================================

class Base(DeclarativeBase):
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)



class GUID(TypeDecorator):
    """
    Platform-independent UUID type.

    Stores UUID as CHAR(36) in MariaDB/MySQL.
    Returns python uuid.UUID objects.
    """

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None

        if isinstance(value, uuid.UUID):
            return str(value)

        return str(uuid.UUID(value))

    def process_result_value(self, value, dialect):
        if value is None:
            return None

        return uuid.UUID(value)

# =============================================================================
# ENUMS
# =============================================================================

class MessageType(str, Enum):
    text = "text"
    file = "file"
    call_log = "call_log"


class ConversationType(str, Enum):
    direct = "direct"
    solo = "solo"


# =============================================================================
# BASE MIXIN
# =============================================================================

class SyncableMixin:
    created_at = Column(
        BigInteger,
        nullable=False,
        default=_now_ms,
    )

    updated_at = Column(
        BigInteger,
        nullable=False,
        default=_now_ms,
        onupdate=_now_ms,
    )

    is_deleted = Column(
        Boolean,
        nullable=False,
        default=False,
        index=True,
    )

# =============================================================================
# USER
# =============================================================================

class User(Base):
    """
    Mirror of SQLModel User table.
    DO NOT MODIFY STRUCTURE unless the main API changes.
    """

    __tablename__ = "user"
    __table_args__ = {"extend_existing": True}

    id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    username = Column(
        String(50),
        nullable=False,
        unique=True,
        index=True,
    )

    first_name = Column(
        String(50),
        nullable=False,
        index=True,
    )

    last_name = Column(
        String(50),
        nullable=False,
        index=True,
    )

    phone_number = Column(
        String(20),
        unique=True,
        nullable=True,
    )

    email = Column(
        String(255),
        unique=True,
        nullable=True,
    )

    hashed_password = Column(
        String(255),
        nullable=False,
    )

    email_verified = Column(
        Boolean,
        default=False,
        nullable=False,
    )

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


# =============================================================================
# CONVERSATION
# =============================================================================

class Conversation(Base, SyncableMixin):
    __tablename__ = "conversation"
    __table_args__ = {"extend_existing": True}

    id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        index=True,
    )

    title = Column(
        String(100),
        nullable=False,
    )

    conversation_type = Column(
        SAEnum(ConversationType),
        nullable=False,
    )

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

    id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        index=True,
    )

    conversation_id = Column(
        GUID(),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    user_id = Column(
        GUID(),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    joined_at = Column(
        BigInteger,
        nullable=False,
        default=_now_ms,
    )

    user = relationship(
        "User",
        back_populates="conversation_participants",
    )

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

    id = Column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
        index=True,
    )

    message_type = Column(
        SAEnum(MessageType),
        nullable=False,
        default=MessageType.text,
    )

    content = Column(
        String(255),
        nullable=False,
    )

    conversation_id = Column(
        GUID(),
        ForeignKey("conversation.id", ondelete="CASCADE"),
        nullable=True,
    )

    sender_id = Column(
        GUID(),
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=True,
    )

    user = relationship(
        "User",
        back_populates="messages",
    )

    conversation = relationship(
        "Conversation",
        back_populates="messages",
    )

# =============================================================================
# RELAY-ONLY MODELS
# =============================================================================

class SmsSession(Base):
    """
    Per-phone-number conversation state for the SMS relay flow.
    Completely invisible to the main SAPOT API.
    """
    __tablename__ = "sms_session"

    phone           = Column(String(20), primary_key=True)
    stage           = Column(String(20), nullable=False, default="NEW")
    # stage: NEW | AWAITING_TARGET | ACTIVE
    target_phone    = Column(String(20), nullable=True)
    target_username = Column(String(50), nullable=True)
    last_seen       = Column(BigInteger, nullable=False, default=_now_ms,
                             onupdate=_now_ms)


class SmsLog(Base):
    """
    Delivery log for every SMS in/out through the relay.
    """
    __tablename__ = "sms_log"

    id             = Column(CHAR(36), primary_key=True,
                            default=lambda: str(uuid.uuid4()))
    direction      = Column(String(3),  nullable=False)   # IN | OUT
    from_number    = Column(String(20), nullable=False)
    to_number      = Column(String(20), nullable=False)
    body           = Column(Text,       nullable=False)
    status         = Column(String(10), nullable=False, default="pending")
    # pending | received | sent | failed
    failure_reason = Column(String(100), nullable=True)
    created_at     = Column(BigInteger,  nullable=False, default=_now_ms)


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


def get_messages(limit: int = 50, direction: Optional[str] = None,
                 phone: Optional[str] = None) -> list[dict]:
    with new_get_session() as s:
        q = select(SmsLog)
        if direction:
            q = q.where(SmsLog.direction == direction)
        if phone:
            q = q.where(
                (SmsLog.from_number == phone) | (SmsLog.to_number == phone)
            )
        q = q.order_by(SmsLog.created_at.desc()).limit(limit)
        rows = s.execute(q).scalars().all()
        return [{
            "id":             str(r.id),
            "direction":      r.direction,
            "from_number":    r.from_number,
            "to_number":      r.to_number,
            "body":           r.body,
            "status":         r.status,
            "failure_reason": r.failure_reason,
            "created_at":     r.created_at,
        } for r in rows]


# =============================================================================
# APP FORWARD  —  write message into shared Conversation + Message tables
# so the forwarded SMS appears inside the SAPOT app natively
# =============================================================================

# UUID of the "SMS Bot" user in your system.
# Create this user once in your main API and paste the UUID here,
# or set the SMS_BOT_USER_ID environment variable.
import os
SMS_BOT_USER_ID: Optional[str] = os.environ.get("SMS_BOT_USER_ID")


def notify_app(sender_phone: str, target_phone: str, body: str) -> bool:
    """
    Write the forwarded message into the shared database so it appears
    in the SAPOT app conversation for the target user.

    Strategy
    ─────────
    1. Resolve both phone numbers to User rows.
    2. Find or create a direct Conversation between them.
       Title: "SMS from <sender_phone>" so it's clearly an SMS relay thread.
    3. Add both users as ConversationParticipants if not already present.
    4. Insert a Message row with the body, attributed to the bot user
       (or to the sender user if the bot account isn't configured).
    5. Return True on success, False on any error.
    """
    try:
        with new_get_session() as s:
            # 1. Resolve users
            sender = s.execute(
                select(User).where(User.phone_number == sender_phone)
            ).scalar_one_or_none()

            target = s.execute(
                select(User).where(User.phone_number == target_phone)
            ).scalar_one_or_none()

            if target is None:
                logger.error("notify_app: target %s not found", target_phone)
                return False

            sender_id = str(sender.id) if sender else SMS_BOT_USER_ID

            # 2. Find existing SMS relay conversation between these two phones.
            #    We identify it by title convention. A more robust approach would
            #    be a dedicated relay_conversation table — add one if you need
            #    multi-conversation support per pair.
            conv_title = f"SMS {sender_phone}"

            conversation_id = direct_conversation_id(str(target.id), str(sender_id))

            existing_conv = s.execute(
                select(Conversation)
                .where(Conversation.id == conversation_id)
                .where(Conversation.is_deleted == False)
            ).scalar_one_or_none()

            if existing_conv is None:
                # Create conversation
                conv = Conversation(
                    id=conversation_id,
                    title=conv_title,
                    conversation_type=ConversationType.direct,
                )
                s.add(conv)
                s.flush()   # get conv.id before adding participants

                # Add participants
                participants_to_add = []
                if sender:
                    participants_to_add.append(
                        ConversationParticipant(
                            id=str(uuid.uuid4()),
                            conversation_id=conv.id,
                            user_id=str(sender.id),
                        )
                    )
                participants_to_add.append(
                    ConversationParticipant(
                        id=str(uuid.uuid4()),
                        conversation_id=conv.id,
                        user_id=str(target.id),
                    )
                )
                s.add_all(participants_to_add)
                conv_id = conv.id

            else:
                conv_id = existing_conv.id

                # Ensure target is a participant (idempotent)
                already_in = s.execute(
                    select(ConversationParticipant)
                    .where(ConversationParticipant.conversation_id == conv_id)
                    .where(ConversationParticipant.user_id == str(target.id))
                    .where(ConversationParticipant.is_deleted == False)
                ).scalar_one_or_none()

                if already_in is None:
                    s.add(ConversationParticipant(
                        id=str(uuid.uuid4()),
                        conversation_id=conv_id,
                        user_id=str(target.id),
                    ))

            # 3. Insert the message
            msg = Message(
                id=str(uuid.uuid4()),
                message_type=MessageType.text,
                content=body[:255],         # enforce DB max_length
                conversation_id=conv_id,
                sender_id=sender_id,        # bot or real sender
            )
            s.add(msg)
            s.commit()

            logger.info(
                "notify_app: message written to conversation %s "
                "(sender=%s target=%s)",
                conv_id, sender_phone, target_phone,
            )
            return True

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
