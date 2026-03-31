import pytest
from fastapi.encoders import jsonable_encoder
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

def test_sync_incremental(client:TestClient, sync_data):

    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('phone_number'),
        'password': sample_user.get('password'),
    }
    response = client.post('/auth/token', data=form_data)

    token = response.json()

    assert "access_token" in token

    assert token['token_type'] == 'bearer'
    user = sync_data["user"]
    mid_ts = sync_data["timestamps"]["mid"].isoformat()

    # This should return the Call, the New Message, and the Deleted Message
    # but NOT the Old Message.
    # Extract the actual string from the dictionary
    access_token = token["access_token"]

    # Format the header as "Bearer <token>"
    headers = {"Authorization": f"Bearer {access_token}"}

    # Send the request
    response = client.get(
        "/sync",
        params={"last_sync": mid_ts}, # httpx/TestClient will encode this safely
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()

    assert len(data["messages"]) == 2  # New + Deleted
    assert len(data["calls"]) == 1     # The call log
    assert data["messages"][0]["content"] == "New Message"


def test_sync_incremental_conversations(client:TestClient, sync_extra_data_fixture):

    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('phone_number'),
        'password': sample_user.get('password'),
    }
    response = client.post('/auth/token', data=form_data)

    token = response.json()

    assert "access_token" in token

    assert token['token_type'] == 'bearer'
    user = sync_extra_data_fixture["user"]
    mid_ts = sync_extra_data_fixture["timestamps"]["mid"].isoformat()

    # This should return the Call, the New Message, and the Deleted Message
    # but NOT the Old Message.
    # Extract the actual string from the dictionary
    access_token = token["access_token"]

    # Format the header as "Bearer <token>"
    headers = {"Authorization": f"Bearer {access_token}"}

    # Send the request
    response = client.get(
        "/sync",
        params={"last_sync": mid_ts}, # httpx/TestClient will encode this safely
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    print(sample_user)
    print("DATA", data["call_participants"])
    print("mid",mid_ts)
    assert len(data["messages"]) == 2  # New + Deleted
    assert len(data["calls"]) == 1     # The call log
    assert len(data["conversations"]) == 1     # The call log
    assert len(data["conversation_participants"]) == 1     # The call log
    assert len(data["call_participants"]) == 1, "call participants count is wrong"     # The call log
    assert len(data["message_receipts"]) == 1     # The call log
    assert data["messages"][0]["content"] == "New Message"



def test_sync_check_updates(client: TestClient, sync_data):
    # 1. Authenticate
    sample_user = sample_users['test']
    form_data = {
        'username': sample_user.get('phone_number'),
        'password': sample_user.get('password'),
    }
    token_res = client.post('/auth/token', data=form_data)
    access_token = token_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # --- Scenario A: Has Updates ---
    # Use the 'mid' timestamp from your fixture (which is before the new message and call)
    mid_ts = sync_data["timestamps"]["mid"].isoformat()

    response = client.get(
        "/sync/check",
        params={"last_sync": mid_ts},
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["has_updates"] is True
    # In your fixture: 1 New Msg + 1 Deleted Msg + 1 Call = 3 new items
    assert data["new_items_count"] == 5

    # --- Scenario B: No Updates ---
    # Use a timestamp from the future (right now)
    future_ts = (datetime.now(timezone.utc) + timedelta(minutes=1)).isoformat()

    response = client.get(
        "/sync/check",
        params={"last_sync": future_ts},
        headers=headers
    )

    assert response.status_code == 200
    data = response.json()
    assert data["has_updates"] is False
    assert data["new_items_count"] == 0


import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient

import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient

def test_push_reconciliation(client: TestClient):
    # 1. Authenticate
    sample_user = sample_users['test']
    token_res = client.post('/auth/token', data={
        'username': sample_user.get('phone_number'),
        'password': sample_user.get('password'),
    })
    access_token = token_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Create actual UUID objects (not strings)
    # This prevents the 'str' object has no attribute 'hex' error
    user_id = uuid.UUID(str(sample_user.get('id')))
    conv_id = uuid.uuid4()
    msg_id = uuid.uuid4()
    part_id = uuid.uuid4()
    call_id = uuid4()

    # 3. Prepare Payload
    # Note: We use .isoformat() for dates, but keep IDs as UUID objects
    push_payload = {
        "conversations": [
            {
                "id": conv_id,
                "title": "Sync Test",
                "conversation_type": "group",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "conversation_participants": [
            {
                "id": part_id,
                "conversation_id": conv_id,
                "user_id": user_id,
                "joined_at": datetime.now(timezone.utc).isoformat(),
                "is_deleted": False
            }
        ],
        "messages": [
            {
                "id": msg_id,
                "conversation_id": conv_id,
                "content": "Reconciliation check",
                "message_type": "text",
                "is_deleted": False,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ],
        "calls": [
            {
                "id": str(call_id),
                "call_type": "video",  # CallType.AUDIO
                "status": "completed", # StatusType.COMPLETED
                "start_time": datetime.now(timezone.utc).isoformat(),
                "end_time": datetime.now(timezone.utc).isoformat(),
                "conversation_id": str(conv_id),
                "initiator_id": str(user_id)
            }
        ],
        "call_participants": [
            {
                "id": str(uuid4()),
                "conversation_id": str(conv_id),
                "user_id": str(user_id),
                "joined_at": datetime.now(timezone.utc).isoformat(),
                "left_at": None
            }
        ],
        "message_receipts": [
            {
                "id": str(uuid4()),
                "status": "read", # StatusType.READ
                "message_id": str(msg_id),
                "user_id": str(user_id),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        ]
    }

    # 4. Execute
    # The json= parameter handles the conversion of UUID objects to strings for the HTTP request
    sanitized_payload = jsonable_encoder(push_payload)
    response = client.post("/sync/push", json=sanitized_payload, headers=headers)

    # 5. Assertions
    assert response.status_code == 200
    assert response.json()["status"] == "success"
