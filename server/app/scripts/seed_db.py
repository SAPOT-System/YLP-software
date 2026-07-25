#!/usr/bin/env python3
"""Seed the local development database with sample users, conversations, messages, and calls.

`server/app/` is itself the `app` package (it has an `__init__.py`), so `-m app...` needs
`server/` — the package's *parent* — as the working directory, not `server/app/`.

Docker stack (docs/getting-started/docker-setup.md) — simplest, network access guaranteed:

    docker compose exec api python -m app.scripts.seed_db

Bare-metal (docs/getting-started/server-setup.md), from `server/` using the project venv:

    cd server
    ENVIRONMENT=development ./app/venv/bin/python -m app.scripts.seed_db

Idempotent: re-running skips records that already exist (matched by username / conversation
title), so it's safe to run after every `docker compose up` without duplicating data.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv()

if os.environ.get("ENVIRONMENT") != "development":
    sys.exit(
        "Refusing to seed: ENVIRONMENT must be 'development' "
        f"(got {os.environ.get('ENVIRONMENT')!r}). This script writes sample data "
        "and must never run against a production database."
    )

from sqlmodel import Session, select

from app.db_operations.auth import create_db_and_tables, engine, get_password_hash, verify_password
from app.models.admin import Admin
from app.models.call import Call, CallType, StatusType as CallStatus
from app.models.conversation import Conversation, ConversationParticipant, ConversationType
from app.models.message import Message, MessageType
from app.models.users import User
from app.tests.assets import sample_users


def to_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


# assets.py's "test" user ships with a phone number ("+638788667676") that fails the
# app's own PhoneStr pattern (^\+639\d{9}$ — must start +639). It passes silently through
# SQLModel table-model construction (no validation there) but 500s any endpoint that
# builds a strict Pydantic model from it, e.g. GET /user-utils/current-user-info via
# UserInfo. assets.py can't be fixed directly — test_admin_me.py asserts on that exact
# value — so the correction is applied only to this seeded dev-database copy.
TEST_USER_PHONE_OVERRIDE = "+639178866767"

# All seeded accounts (sample users + admin) share this password rather than the
# per-character passwords in assets.py, so testers only need to remember one.
COMMON_PASSWORD = "Password321"


def seed_users(session: Session) -> list[User]:
    common_hash = get_password_hash(COMMON_PASSWORD)
    users = []
    for data in sample_users.values():
        phone_number = (
            TEST_USER_PHONE_OVERRIDE if data["username"] == "test" else data["phone_number"]
        )

        existing = session.exec(select(User).where(User.username == data["username"])).first()
        if existing:
            if existing.phone_number != phone_number:
                existing.phone_number = phone_number
                session.add(existing)
            if not verify_password(COMMON_PASSWORD, existing.hashed_password):
                existing.hashed_password = common_hash
                session.add(existing)
            users.append(existing)
            continue
        user = User(
            id=data["id"],
            username=data["username"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone_number=phone_number,
            email=data["email"],
            hashed_password=common_hash,
            email_verified=True,
        )
        session.add(user)
        users.append(user)
    session.commit()
    for user in users:
        session.refresh(user)
    return users


ADMIN_ACCOUNT = {
    "username": "admin",
    "first_name": "Admin",
    "last_name": "User",
    "phone_number": "+639300000001",
    "email": "admin@sapot.local",
}


def seed_admin(session: Session) -> User:
    user = session.exec(select(User).where(User.username == ADMIN_ACCOUNT["username"])).first()
    if not user:
        user = User(
            username=ADMIN_ACCOUNT["username"],
            first_name=ADMIN_ACCOUNT["first_name"],
            last_name=ADMIN_ACCOUNT["last_name"],
            phone_number=ADMIN_ACCOUNT["phone_number"],
            email=ADMIN_ACCOUNT["email"],
            hashed_password=get_password_hash(COMMON_PASSWORD),
            email_verified=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif not verify_password(COMMON_PASSWORD, user.hashed_password):
        user.hashed_password = get_password_hash(COMMON_PASSWORD)
        session.add(user)
        session.commit()
        session.refresh(user)

    has_admin_role = session.exec(select(Admin).where(Admin.user_id == user.id)).first()
    if not has_admin_role:
        session.add(Admin(user_id=user.id))
        session.commit()

    return user


def seed_conversation(session: Session, user_a: User, user_b: User) -> Conversation:
    title = f"{user_a.username} & {user_b.username}"
    existing = session.exec(select(Conversation).where(Conversation.title == title)).first()
    if existing:
        return existing

    conversation = Conversation(title=title, conversation_type=ConversationType.direct)
    session.add(conversation)
    session.flush()

    for user in (user_a, user_b):
        session.add(ConversationParticipant(conversation_id=conversation.id, user_id=user.id))

    session.commit()
    session.refresh(conversation)
    return conversation


def seed_messages(session: Session, conversation: Conversation, user_a: User, user_b: User) -> None:
    existing = session.exec(select(Message).where(Message.conversation_id == conversation.id)).first()
    if existing:
        return

    now = datetime.now(timezone.utc)
    exchange = [
        (user_a, "Hey, you copy?", 120),
        (user_b, "Copy. Go ahead.", 115),
        (user_a, "Status update: en route to checkpoint.", 90),
        (user_b, "Acknowledged, ETA?", 85),
        (user_a, "About 15 mikes out.", 80),
    ]
    for sender, content, minutes_ago in exchange:
        ts = to_ms(now - timedelta(minutes=minutes_ago))
        session.add(
            Message(
                content=content,
                message_type=MessageType.text,
                conversation_id=conversation.id,
                sender_id=sender.id,
                created_at=ts,
                updated_at=ts,
            )
        )
    session.commit()


# Matches MESSAGE_PAGE_SIZE in mobile-app/.../features/chat/components/message-list.tsx
# (100) and the server's /public-chat default limit — 200 guarantees at least two pages
# so pagination (loading more, scroll-back cursor) is actually exercised locally.
BULK_MESSAGE_TARGET = 200


def seed_bulk_messages(
    session: Session, conversation: Conversation, user_a: User, user_b: User, target: int = BULK_MESSAGE_TARGET
) -> None:
    existing = session.exec(select(Message).where(Message.conversation_id == conversation.id)).all()
    to_create = target - len(existing)
    if to_create <= 0:
        return

    now = datetime.now(timezone.utc)
    participants = (user_a, user_b)
    start_index = len(existing)
    for n in range(to_create):
        sender = participants[n % 2]
        minutes_ago = (to_create - n) * 3
        ts = to_ms(now - timedelta(minutes=minutes_ago))
        session.add(
            Message(
                content=f"Pagination stress-test message #{start_index + n + 1}",
                message_type=MessageType.text,
                conversation_id=conversation.id,
                sender_id=sender.id,
                created_at=ts,
                updated_at=ts,
            )
        )
    session.commit()


def seed_call(session: Session, conversation: Conversation, initiator: User) -> None:
    # CallParticipant is intentionally not seeded here: its `call_id` field is
    # declared with foreign_key='conversation.id' (server/app/models/call_participant.py),
    # which looks like a copy-paste bug (it should reference call.id) — inserting through
    # it would either violate the FK against a real MariaDB dev DB or silently store the
    # wrong id. Flagging rather than seeding around it; worth a separate fix.
    existing = session.exec(select(Call).where(Call.conversation_id == conversation.id)).first()
    if existing:
        return

    now = datetime.now(timezone.utc)
    start = to_ms(now - timedelta(minutes=60))
    session.add(
        Call(
            call_type=CallType.audio,
            status=CallStatus.completed,
            conversation_id=conversation.id,
            initiator_id=initiator.id,
            start_time=start,
            end_time=start + 5 * 60 * 1000,
            updated_at=start,
        )
    )
    session.commit()


def run() -> None:
    create_db_and_tables()
    with Session(engine) as session:
        users = seed_users(session)
        print(f"Users: {len(users)} (created or already present)")

        admin_user = seed_admin(session)
        print(f"Admin: {admin_user.username} ({admin_user.email})")

        pairs = 0
        for i in range(0, len(users) - 1, 2):
            user_a, user_b = users[i], users[i + 1]
            conversation = seed_conversation(session, user_a, user_b)
            if i == 0:
                # First pair gets the pagination stress-test volume; the rest stay light.
                seed_bulk_messages(session, conversation, user_a, user_b)
            else:
                seed_messages(session, conversation, user_a, user_b)
            seed_call(session, conversation, user_a)
            pairs += 1

        print(
            f"Conversations: {pairs} direct conversation(s), each with a call log; "
            f"the first has >= {BULK_MESSAGE_TARGET} messages for pagination testing"
        )

    print("Seed complete.")


if __name__ == "__main__":
    run()
