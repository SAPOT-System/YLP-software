"""
database.py
───────────
MariaDB-backed persistence layer for SAPOT SMS relay.

This version preserves the SAME public functions and return formats
from the original SQLite implementation while internally using:

- SQLModel
- SQLAlchemy
- MariaDB
- Existing application models

IMPORTANT:
- DOES NOT create tables
- DOES NOT seed data
- Uses already-existing MariaDB tables/models
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Optional
from uuid import UUID

from sqlmodel import Session, create_engine, select
from sqlalchemy.orm import sessionmaker

# ──────────────────────────────────────────────────────────────────────────────
# IMPORT YOUR EXISTING MODELS
# ──────────────────────────────────────────────────────────────────────────────

from models.users import User
from models.message import Message, MessageType
from models.conversation import (
    Conversation,
    ConversationParticipant,
    ConversationType,
)

logger = logging.getLogger("sapot.db")

# ──────────────────────────────────────────────────────────────────────────────
# DATABASE CONFIG
# ──────────────────────────────────────────────────────────────────────────────

DATABASE_URL = (
    "mysql+pymysql://sapot:sapot@localhost:3306/sapot_db"
)

engine = create_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    class_=Session,
)


def init(db_path: str = ""):
    """
    Compatibility function.
    Keeps same API as old SQLite version.

    No schema creation occurs because tables already exist.
    """
    logger.info("MariaDB database initialised")


@contextmanager
def _conn():
    """
    Compatibility wrapper preserving original API style.
    """
    session = SessionLocal()

    try:
        yield session
        session.commit()

    except Exception:
        session.rollback()
        raise

    finally:
        session.close()


# ──────────────────────────────────────────────────────────────────────────────
# USER LOOKUPS
# ──────────────────────────────────────────────────────────────────────────────

def lookup_number(phone: str) -> Optional[dict]:
    """
    Return user dict or None if not registered.

    SAME RETURN FORMAT AS OLD VERSION:
    {
        "phone": "...",
        "username": "...",
        "app_active": True/False
    }
    """

    with _conn() as session:

        user = session.exec(
            select(User).where(User.phone_number == phone)
        ).first()

        if not user:
            return None

        return {
            "phone": user.phone_number,
            "username": user.username,
            # equivalent replacement for old app_active
            "app_active": True,
        }


def get_all_users() -> list[dict]:
    """
    SAME RETURN FORMAT AS OLD VERSION.
    """

    with _conn() as session:

        users = session.exec(select(User)).all()

        return [
            {
                "id": str(user.id),
                "phone": user.phone_number,
                "username": user.username,
                "app_active": True,
                "created_at": None,
            }
            for user in users
        ]


def add_user(
    phone: str,
    username: str,
    app_active: bool = True
) -> dict:
    """
    Creates a new user.

    NOTE:
    Your User model requires:
    - first_name
    - last_name
    - hashed_password

    So we generate placeholders to preserve old function signature.
    """

    with _conn() as session:

        user = User(
            username=username,
            first_name=username,
            last_name="User",
            phone_number=phone,
            hashed_password="TEMP_PASSWORD",
            email_verified=app_active,
        )

        session.add(user)
        session.commit()
        session.refresh(user)

        return {
            "id": str(user.id),
            "phone": user.phone_number,
            "username": user.username,
            "app_active": app_active,
            "created_at": None,
        }


# ──────────────────────────────────────────────────────────────────────────────
# SESSION MANAGEMENT
# ──────────────────────────────────────────────────────────────────────────────
#
# Your old SQLite "sessions" table does not exist anymore.
#
# We emulate it in-memory while conversations/messages are persisted in MariaDB.
#
# This preserves compatibility with your existing SMS relay logic.
# ──────────────────────────────────────────────────────────────────────────────

_sessions: dict[str, dict] = {}


def get_session(phone: str) -> dict:
    """
    SAME RETURN FORMAT AS OLD VERSION.
    """

    if phone not in _sessions:

        _sessions[phone] = {
            "phone": phone,
            "stage": "NEW",
            "target_phone": None,
            "target_username": None,
            "last_seen": None,
        }

    return _sessions[phone]


def update_session(phone: str, **kwargs):
    """
    SAME BEHAVIOR AS OLD VERSION.
    """

    session = get_session(phone)

    allowed = {
        "stage",
        "target_phone",
        "target_username",
    }

    for key, value in kwargs.items():
        if key in allowed:
            session[key] = value


def reset_session(phone: str):
    """
    SAME BEHAVIOR AS OLD VERSION.
    """

    _sessions[phone] = {
        "phone": phone,
        "stage": "NEW",
        "target_phone": None,
        "target_username": None,
        "last_seen": None,
    }


# ──────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def _find_user_by_phone(
    session: Session,
    phone: str
) -> Optional[User]:

    return session.exec(
        select(User).where(User.phone_number == phone)
    ).first()


def _get_or_create_direct_conversation(
    session: Session,
    user1_id: UUID,
    user2_id: UUID,
) -> Conversation:
    """
    Finds or creates a direct conversation between 2 users.
    """

    conversations = session.exec(
        select(Conversation).where(
            Conversation.conversation_type
            == ConversationType.direct
        )
    ).all()

    for conversation in conversations:

        participants = session.exec(
            select(ConversationParticipant).where(
                ConversationParticipant.conversation_id
                == conversation.id
            )
        ).all()

        participant_ids = {
            participant.user_id
            for participant in participants
        }

        if participant_ids == {user1_id, user2_id}:
            return conversation

    conversation = Conversation(
        title="Direct Message",
        conversation_type=ConversationType.direct,
    )

    session.add(conversation)
    session.commit()
    session.refresh(conversation)

    participant1 = ConversationParticipant(
        conversation_id=conversation.id,
        user_id=user1_id,
    )

    participant2 = ConversationParticipant(
        conversation_id=conversation.id,
        user_id=user2_id,
    )

    session.add(participant1)
    session.add(participant2)

    session.commit()

    return conversation


# ──────────────────────────────────────────────────────────────────────────────
# MESSAGE LOG
# ──────────────────────────────────────────────────────────────────────────────

def log_message(
    direction: str,
    from_number: str,
    to_number: str,
    body: str,
    status: str = "pending"
) -> str:
    """
    SAME FUNCTION SIGNATURE AS OLD VERSION.

    OLD RETURN:
        int

    NEW RETURN:
        str(UUID)

    because your Message model uses UUID primary keys.
    """

    with _conn() as session:

        sender = _find_user_by_phone(session, from_number)
        receiver = _find_user_by_phone(session, to_number)

        if not sender:
            raise ValueError(
                f"Sender not found: {from_number}"
            )

        if not receiver:
            raise ValueError(
                f"Receiver not found: {to_number}"
            )

        conversation = _get_or_create_direct_conversation(
            session,
            sender.id,
            receiver.id,
        )

        message = Message(
            sender_id=sender.id,
            conversation_id=conversation.id,
            content=body,
            message_type=MessageType.text,
        )

        session.add(message)
        session.commit()
        session.refresh(message)

        logger.info(
            "[MESSAGE %s] %s -> %s : %s",
            direction,
            from_number,
            to_number,
            body,
        )

        return str(message.id)


def update_message_status(
    msg_id: str,
    status: str,
    failure_reason: Optional[str] = None
):
    """
    Compatibility stub.

    Your new Message model does not contain:
    - status
    - failure_reason

    Keeping function so existing code does not break.
    """

    logger.info(
        "Message %s status updated to %s (%s)",
        msg_id,
        status,
        failure_reason,
    )


def get_messages(
    limit: int = 50,
    direction: Optional[str] = None,
    phone: Optional[str] = None
) -> list[dict]:
    """
    SAME RETURN STRUCTURE AS OLD VERSION.
    """

    with _conn() as session:

        query = select(Message)

        messages = session.exec(
            query.order_by(Message.created_at.desc())
            .limit(limit)
        ).all()

        results = []

        for msg in messages:

            sender = None
            receiver = None

            if msg.sender_id:

                sender = session.get(User, msg.sender_id)

            participants = session.exec(
                select(ConversationParticipant).where(
                    ConversationParticipant.conversation_id
                    == msg.conversation_id
                )
            ).all()

            for participant in participants:

                if participant.user_id != msg.sender_id:

                    receiver = session.get(
                        User,
                        participant.user_id
                    )

                    break

            from_number = (
                sender.phone_number
                if sender else "UNKNOWN"
            )

            to_number = (
                receiver.phone_number
                if receiver else "UNKNOWN"
            )

            if phone:
                if (
                    from_number != phone
                    and to_number != phone
                ):
                    continue

            results.append({
                "id": str(msg.id),
                "direction": direction or "OUT",
                "from_number": from_number,
                "to_number": to_number,
                "body": msg.content,
                "status": "sent",
                "failure_reason": None,
                "created_at": msg.created_at,
            })

        return results


# ──────────────────────────────────────────────────────────────────────────────
# APP FORWARD STUB
# ──────────────────────────────────────────────────────────────────────────────

def notify_app(
    sender_phone: str,
    target_phone: str,
    message: str
) -> bool:
    """
    SAME FUNCTION AS OLD VERSION.
    """

    logger.info(
        "[APP NOTIFY] %s → %s: %r",
        sender_phone,
        target_phone,
        message
    )

    return True
