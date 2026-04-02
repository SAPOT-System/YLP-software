from datetime import datetime, timezone, timedelta
import pytest
import logging
import uuid
import pytest
from sqlmodel import SQLModel, Session, StaticPool, create_engine, select

from app.main import app
from fastapi.testclient import TestClient

from app.db_operations.auth import SessionDep, db_create_user, get_password_hash, get_session, verify_password
from app.models.conversation import Conversation, ConversationType, ConversationParticipant, ConversationType
from app.models.users import User, UserCreate
from app.models.message import Message, MessageType
from app.models.message_receipt import MessageReceipt, StatusType
from app.models.call import Call, CallType, StatusType as CallStatus
from app.models.call_participant import CallParticipant
from app.tests.assets import sample_users
from app.models.rescuer import Rescuer

from uuid import uuid4
from datetime import datetime, timedelta, timezone
from sqlmodel import Session, select


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


@pytest.fixture(name="sync_extra_data_fixture")
def sync_extra_data_fixture(session: Session):
    """
    Creates a full sync environment:
    - 1 Conversation
    - 2 Participants (User + a ghost contact)
    - 3 Messages (Old, New, Deleted)
    - 1 Call with Participant data
    - 1 Message Receipt
    """
    # 1. Grab existing user
    user = session.exec(select(User)).first()
    if not user:
        pytest.fail("No users found. Check session_fixture.")

    # 2. Create a Conversation
    now = datetime.now(timezone.utc)
    conv = Conversation(
        id=uuid4(),
        title="Sync Test Group",
        conversation_type=ConversationType.GROUP,
        created_at=now - timedelta(hours=2)
    )
    session.add(conv)
    session.flush() # Get ID without committing entire transaction yet

    # 3. Add Conversation Participants
    participant = ConversationParticipant(
        id=uuid4(),
        conversation_id=conv.id,
        user_id=user.id,
        joined_at=now - timedelta(hours=2)
    )
    session.add(participant)

    # 4. Message 1: Old (T-60 mins)
    msg_old = Message(
        id=uuid4(),
        content="Old Message",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        updated_at=now - timedelta(minutes=60),
        created_at=now - timedelta(minutes=60)
    )

    # 5. Call Log & Call Participant (T-30 mins)
    call_log = Call(
        id=uuid4(),
        call_type=CallType.AUDIO,
        status=CallStatus.COMPLETED,
        conversation_id=conv.id,
        initiator_id=user.id,
        start_time=now - timedelta(minutes=30),
        end_time=now - timedelta(minutes=25),
        updated_at=now - timedelta(minutes=30)
    )
    session.add(call_log)
    session.flush()

    call_part = CallParticipant(
        id=uuid4(),
        conversation_id=conv.id,
        user_id=user.id,
        joined_at=now, #- timedelta(minutes=10),
        left_at=now#- timedelta(minutes=10)
    )

    # 6. Message 2: New (T-10 mins)
    msg_new = Message(
        id=uuid4(),
        content="New Message",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        updated_at=now - timedelta(minutes=10)
    )
    session.add(msg_new)
    session.flush()


    conv_participant = ConversationParticipant(
        id=uuid4(),
        conversation_id=conv.id,
        user_id=user.id,
        is_deleted=False,
        joined_at= now
    )

    session.add(conv_participant)
    session.flush()

    # 7. Message Receipt for Message 2
    receipt = MessageReceipt(
        id=uuid4(),
        message_id=msg_new.id,
        user_id=user.id,
        status=StatusType.READ, # Using your StatusType Enum for receipts
        updated_at=now - timedelta(minutes=8)
    )

    # 8. Message 3: Deleted (T-5 mins)
    msg_deleted = Message(
        id=uuid4(),
        content="This was deleted",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        is_deleted=True,
        updated_at=now - timedelta(minutes=5)
    )

    # Add all to session
    session.add_all([msg_old, call_part, receipt, msg_deleted])
    session.commit()

    return {
        "user": user,
        "conversation": conv,
        "call": call_log,
        "messages": {
            "old": msg_old,
            "new": msg_new,
            "deleted": msg_deleted
        },
        "timestamps": {
            "old": now - timedelta(minutes=65),   # Before everything
            "mid": now - timedelta(minutes=45),   # Before call and new msgs
            "recent": now - timedelta(minutes=15) # Only new/deleted msgs + receipt
        }
    }


@pytest.fixture
def test_user(session):
    """Creates a standard user in the test database."""
    from app.db_operations.auth import get_password_hash
    user = User(
        id=uuid.uuid4(),
        email="user@test.com",
        username="testusername",
        first_name="Test",
        last_name="User",
        hashed_password=get_password_hash("test_password"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user

@pytest.fixture
def test_rescuer(session, test_user):
    """Links a Rescuer profile to the test user."""
    rescuer = Rescuer(
        id=uuid.uuid4(),
        user_id=test_user.id
    )
    session.add(rescuer)
    session.commit()
    session.refresh(rescuer)
    return rescuer
