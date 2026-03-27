from datetime import datetime, timezone, timedelta
import pytest
import logging
import uuid
import pytest
from sqlmodel import SQLModel, Session, StaticPool, create_engine, select

from app.main import app
from fastapi.testclient import TestClient

from app.db_operations.auth import SessionDep, db_create_user, get_password_hash, get_session, verify_password
from app.models.conversation import Conversation, ConversationType, ConversationParticipant
from app.models.users import User, UserCreate
from app.models.message import Message, MessageType
from app.models.call import Call, CallType, StatusType as CallStatus
from app.tests.assets import sample_users


@pytest.fixture(name="session")
def session_fixture():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:

        for _,hero_data in sample_users.items():
            hero = User(**hero_data)
            session.add(hero)
            session.commit()
            session.refresh(hero)
        yield session


@pytest.fixture(name="client")
def client_fixture(session: Session):
    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture(name="sync_data")
def sync_data_fixture(session: Session):
    """
    Creates a conversation with 3 messages and 1 call spread over time.
    Timeline:
    - T-60 mins: Message 1 (Old)
    - T-30 mins: Call Log
    - T-10 mins: Message 2 (New)
    - T-05 mins: Message 3 (Deleted)
    """
    # 1. Grab an existing user from your sample_users (added in session_fixture)
    user = session.exec(select(User)).first()
    if not user:
        pytest.fail("No users found in session. Ensure session_fixture runs first.")

    # 2. Create a Conversation
    conv = Conversation(
        title="Sync Test Group",
        conversation_type=ConversationType.GROUP,
        created_at=datetime.now(timezone.utc) - timedelta(hours=2)
    )
    session.add(conv)
    session.commit()
    session.refresh(conv)

    # 3. Add User as Participant
    participant = ConversationParticipant(conversation_id=conv.id, user_id=user.id)
    session.add(participant)

    # 4. Create Timeline
    now = datetime.now(timezone.utc)

    # Message 1: Old
    msg_old = Message(
        content="Old Message",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        updated_at=now - timedelta(minutes=60)
    )

    # Call Log
    call_log = Call(
        call_type=CallType.AUDIO,
        status=CallStatus.COMPLETED,
        conversation_id=conv.id,
        initiator_id=user.id,
        updated_at=now - timedelta(minutes=30)
    )

    # Message 2: New
    msg_new = Message(
        content="New Message",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        updated_at=now - timedelta(minutes=10)
    )

    # Message 3: Deleted
    msg_deleted = Message(
        content="This was deleted",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        is_deleted=True,
        updated_at=now - timedelta(minutes=5)
    )

    session.add_all([msg_old, call_log, msg_new, msg_deleted])
    session.commit()

    return {
        "user": user,
        "conversation": conv,
        "timestamps": {
            "old": now - timedelta(minutes=65),   # Before everything
            "mid": now - timedelta(minutes=45),   # Between old msg and call
            "recent": now - timedelta(minutes=15) # Only the new/deleted msgs
        }
    }
