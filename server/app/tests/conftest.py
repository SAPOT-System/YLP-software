from datetime import datetime, timezone, timedelta
import pytest
from uuid import uuid4
from sqlmodel import select
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


def to_ms(dt: datetime):
    return int(dt.timestamp() * 1000)

@pytest.fixture(name="sync_data")
def sync_data_fixture(session: Session):
    user = session.exec(select(User)).first()
    if not user:
        pytest.fail("No users found.")

    now = datetime.now(timezone.utc)

    # 1. Create a Conversation
    conv = Conversation(
        id=uuid4(),
        title="Sync Test Group",
        conversation_type=ConversationType.GROUP,
        created_at=to_ms(now - timedelta(hours=2)),
        updated_at=to_ms(now - timedelta(hours=2))
    )
    session.add(conv)
    session.commit()
    session.refresh(conv)

    # 2. Add Participant
    participant = ConversationParticipant(
        id=uuid4(), 
        conversation_id=conv.id, 
        user_id=user.id,
        updated_at=to_ms(now - timedelta(hours=2))
    )
    session.add(participant)

    # Message 1: Old (T-60 mins)
    msg_old = Message(
        id=uuid4(),
        content="Old Message",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        created_at=to_ms(now - timedelta(minutes=60)),
        updated_at=to_ms(now - timedelta(minutes=60))
    )

    # Call Log (T-30 mins)
    call_log = Call(
        id=uuid4(),
        call_type=CallType.AUDIO,
        status=CallStatus.COMPLETED,
        conversation_id=conv.id,
        initiator_id=user.id,
        updated_at=to_ms(now - timedelta(minutes=30))
    )

    # Message 2: New (T-10 mins)
    msg_new = Message(
        id=uuid4(),
        content="New Message",
        conversation_id=conv.id,
        message_type=MessageType.TEXT,
        sender_id=user.id,
        created_at=to_ms(now - timedelta(minutes=10)),
        updated_at=to_ms(now - timedelta(minutes=10))
    )

    # Message 3: Deleted (T-5 mins)
    msg_deleted = Message(
        id=uuid4(),
        content="This was deleted",
        message_type=MessageType.TEXT,
        conversation_id=conv.id,
        sender_id=user.id,
        is_deleted=True,
        created_at=to_ms(now - timedelta(minutes=20)), # Created earlier
        updated_at=to_ms(now - timedelta(minutes=5))   # Deleted recently
    )

    session.add_all([msg_old, call_log, msg_new, msg_deleted])
    session.commit()

    return {
        "user": user,
        "conversation": conv,
        "timestamps": {
            "old": to_ms(now - timedelta(minutes=65)),
            "mid": to_ms(now - timedelta(minutes=45)),
            "recent": to_ms(now - timedelta(minutes=15))
        }
    }

@pytest.fixture(name="sync_extra_data_fixture")
def sync_extra_data_fixture(session: Session):
    user = session.exec(select(User)).first()
    if not user:
        pytest.fail("No users found.")

    now = datetime.now(timezone.utc)
    
    # 1. Conversation
    conv = Conversation(
        id=uuid4(),
        title="Sync Test Group",
        conversation_type=ConversationType.GROUP,
        created_at=to_ms(now - timedelta(hours=2)),
        updated_at=to_ms(now - timedelta(hours=2))
    )
    session.add(conv)
    session.flush()

    # 2. Participant
    participant = ConversationParticipant(
        id=uuid4(),
        conversation_id=conv.id,
        user_id=user.id,
        updated_at=to_ms(now - timedelta(hours=2))
    )
    session.add(participant)

    # 3. Call Log
    call_log = Call(
        id=uuid4(),
        call_type=CallType.AUDIO,
        status=CallStatus.COMPLETED,
        conversation_id=conv.id,
        initiator_id=user.id,
        updated_at=to_ms(now - timedelta(minutes=30))
    )
    session.add(call_log)
    session.flush()

    # 4. New Message
    msg_new = Message(
        message_type=MessageType.TEXT,
        id=uuid4(),
        content="New Message",
        conversation_id=conv.id,
        sender_id=user.id,
        created_at=to_ms(now - timedelta(minutes=10)),
        updated_at=to_ms(now - timedelta(minutes=10))
    )
    session.add(msg_new)
    session.flush()

    # 5. Message Receipt
    receipt = MessageReceipt(
        id=uuid4(),
        message_id=msg_new.id,
        user_id=user.id,
        status=StatusType.READ,
        updated_at=to_ms(now - timedelta(minutes=8))
    )
    session.add(receipt)

    # 6. Deleted Message
    msg_deleted = Message(
        id=uuid4(),
        message_type=MessageType.TEXT,
        content="This was deleted",
        conversation_id=conv.id,
        sender_id=user.id,
        is_deleted=True,
        updated_at=to_ms(now - timedelta(minutes=5))
    )
    session.add(msg_deleted)
    
    session.commit()

    return {
        "user": user,
        "conversation": conv,
        "timestamps": {
            "mid": to_ms(now - timedelta(minutes=45))
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

@pytest.fixture
def auth_header(client: TestClient):
    """Fixture to get a valid Bearer token for the test user."""
    # Assuming 'test' user exists in your sample_users
    login_data = {"username": "test", "password": "test_password"}
    response = client.post("/auth/token", data=login_data)
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def sample_ids():
    """Consistent UUIDs for testing relationships."""
    return {
        "conv_id": str(uuid4()),
        "msg_id": str(uuid4()),
        "user_id": "550e8400-e29b-41d4-a716-446655440000" # Matches your previous logic
    }
