import pytest
from fastapi.encoders import jsonable_encoder
from sqlmodel import select, func, Session
from app.db_operations.auth import SessionDep
from app.models import Conversation, Message
import time
import uuid
from app.tests.assets import sample_users, sample_invalid_user, sample_valid_user
from datetime import datetime, timedelta, timezone
from uuid import uuid4, UUID
from fastapi.testclient import TestClient
from sqlmodel import Session, select
from app.models.conversation import Conversation, ConversationType, ConversationParticipant
from app.models.message import Message, MessageType
from app.models.call import Call, CallType, StatusType
from app.models.users import User
from fastapi.testclient import TestClient

def test_push_create_records(client: TestClient, auth_header, sample_ids, session: SessionDep):
    payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": sample_ids["conv_id"],
                    "title": "New Test Chat",
                    "conversation_type": "group",
                    "created_at": 1712234500000,
                    "updated_at": 1712234500000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            "messages": {
                "created": [{
                    "id": sample_ids["msg_id"],
                    "content": "Hello World",
                    "conversation_id": sample_ids["conv_id"],
                    "sender_id": sample_ids["user_id"],
                    "created_at": 1712234500001,
                    "updated_at": 1712234500001,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 1712234000000
    }
    print("AUTH", auth_header)
    response = client.post("/sync/push", json=payload, headers=auth_header)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_push_record_count_integrity(client: TestClient, auth_header, sample_ids, session: SessionDep):
    # 1. Get initial count from the database
    initial_conv_count = session.exec(select(func.count(Conversation.id))).one()
    initial_msg_count = session.exec(select(func.count(Message.id))).one()

    # 2. Define payload with 2 new records
    payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": sample_ids["conv_id"],
                    "title": "Count Test Chat",
                    "conversation_type": "group",
                    "created_at": 1712234500000,
                    "updated_at": 1712234500000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            "messages": {
                "created": [{
                    "id": sample_ids["msg_id"],
                    "content": "Verify count",
                    "conversation_id": sample_ids["conv_id"],
                    "sender_id": sample_ids["user_id"],
                    "created_at": 1712234500001,
                    "updated_at": 1712234500001,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 1712234000000
    }

    # 3. Execute the Push
    response = client.post("/sync/push", json=payload, headers=auth_header)
    assert response.status_code == 200

    # 4. Verify the counts increased by exactly 1 for each table
    final_conv_count = session.exec(select(func.count(Conversation.id))).one()
    final_msg_count = session.exec(select(func.count(Message.id))).one()

    assert final_conv_count == initial_conv_count + 1
    assert final_msg_count == initial_msg_count + 1
    
    # 5. Verify data integrity: Check the content of the specific record
    pushed_msg = session.get(Message, UUID(sample_ids["msg_id"]))
    assert pushed_msg.content == "Verify count"
