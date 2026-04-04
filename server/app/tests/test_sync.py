import pytest
from app.models.conversation import ConversationType
from fastapi.encoders import jsonable_encoder
from sqlmodel import select, func, Session
from app.models import Message, Conversation
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



def test_sync_full_cycle(client: TestClient, auth_header, sample_ids):
    """
    1. PUSH: Create a conversation and a message.
    2. PUSH: Update the message and delete the conversation.
    3. PULL: Verify the changes match the timestamps.
    """
    conv_id = str(uuid4())
    msg_id = str(uuid4())
    
    # --- STEP 1: PUSH CREATED DATA ---
    push_create_payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": conv_id,
                    "title": "Initial Title",
                    "conversation_type": "group",
                    "created_at": 1712234000000,
                    "updated_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [], "deleted": []
            }
        },
        "last_pulled_at": 0
    }
    
    res_push_1 = client.post("/sync/push", json=push_create_payload, headers=auth_header)
    assert res_push_1.status_code == 200

    # --- STEP 2: PULL TO GET THE BASELINE TIMESTAMP ---
    res_pull_1 = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    baseline_timestamp = res_pull_1.json()["timestamp"] # e.g. 1775284398173

    # --- STEP 3: PUSH UPDATED & DELETED DATA (In the "Future") ---
    # We use a timestamp higher than the baseline to ensure it shows up in next pull
    future_now = baseline_timestamp + 1000 
    
    push_update_payload = {
        "changes": {
            "conversations": {
                "created": [],
                "updated": [{
                    "id": conv_id,
                    "title": "Updated Title",
                    "updated_at": future_now,
                    "is_deleted": False
                }],
                "deleted": []
            },
            "messages": {
                "created": [{
                    "id": msg_id,
                    "content": "New Message",
                    "conversation_id": conv_id,
                    "sender_id": sample_ids["user_id"],
                    "created_at": future_now,
                    "updated_at": future_now,
                    "is_deleted": False
                }],
                "updated": [], "deleted": []
            }
        },
        "last_pulled_at": baseline_timestamp
    }
    
    res_push_2 = client.post("/sync/push", json=push_update_payload, headers=auth_header)
    assert res_push_2.status_code == 200

    # --- STEP 4: FINAL PULL (THE TRUTH) ---
    # We pull using the baseline. We expect 1 Update (Conv) and 1 Created (Msg)
    res_pull_final = client.get(f"/sync/pull?last_pulled_at={baseline_timestamp}", headers=auth_header)
    data = res_pull_final.json()["changes"]

    # Verify Conversation was moved to 'updated'
    assert len(data["conversations"]["updated"]) == 1
    assert data["conversations"]["updated"][0]["title"] == "Updated Title"
    assert data["conversations"]["updated"][0]["id"] == conv_id

    # Verify Message appears in 'created'
    assert len(data["messages"]["created"]) == 1
    assert data["messages"]["created"][0]["content"] == "New Message"
    
    # Verify the timestamp moved forward
    assert res_pull_final.json()["timestamp"] > baseline_timestamp


def test_sync_deletion_flow(client: TestClient, auth_header):
    """Verify that pushing a deletion results in a deleted ID in the pull."""
    record_id = str(uuid4())
    
    # 1. Create it - Include required 'conversation_type'
    create_payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": record_id, 
                    "title": "To Delete", 
                    "conversation_type": "group", # Required by your schema
                    "updated_at": 1000,
                    "created_at": 1000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            # Include other tables as empty to avoid potential parsing errors
            "messages": {"created": [], "updated": [], "deleted": []},
            "conversation_participants": {"created": [], "updated": [], "deleted": []},
            "calls": {"created": [], "updated": [], "deleted": []},
            "call_participants": {"created": [], "updated": [], "deleted": []},
            "message_receipts": {"created": [], "updated": [], "deleted": []}
        },
        "last_pulled_at": 0
    }
    
    push_res = client.post("/sync/push", json=create_payload, headers=auth_header)
    assert push_res.status_code == 200

    # 2. Delete it
    delete_payload = {
        "changes": {
            "conversations": {
                "created": [],
                "updated": [],
                "deleted": [record_id] # Just the ID string
            }
        },
        "last_pulled_at": 1000
    }
    
    delete_res = client.post("/sync/push", json=delete_payload, headers=auth_header)
    assert delete_res.status_code == 200

    # 3. Pull and check deleted array
    # We pull from 0 to ensure we see the final state of that ID
    res = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    data = res.json()
    
    print("PULL JSON:", data)
    
    deleted_list = data["changes"]["conversations"]["deleted"]
    
    # Validation
    assert record_id in deleted_list
    # Also verify it's NOT in 'created' or 'updated' since it's deleted
    created_ids = [c["id"] for c in data["changes"]["conversations"]["created"]]
    assert record_id not in created_ids

def test_sync_upsert_logic(client: TestClient, auth_header):
    """
    Requirement: 
    1. If 'created' ID exists -> Update it.
    2. If 'updated' ID is missing -> Create it.
    """
    record_id = str(uuid4())
    
    # 1. Send an 'UPDATE' for a record that doesn't exist yet
    # Protocol: MUST create it.
    payload_update_new = {
        "changes": {
            "conversations": {
                "created": [],
                "updated": [{
                    "id": record_id, "title": "I was updated first", 
                    "conversation_type": "solo", "updated_at": 1000
                }],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }
    client.post("/sync/push", json=payload_update_new, headers=auth_header)
    
    # Verify it exists
    res = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    assert any(c["id"] == record_id for c in res.json()["changes"]["conversations"]["created"])

    # 2. Send a 'CREATED' for the same ID
    # Protocol: MUST update it, NOT error.
    payload_create_existing = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": record_id, "title": "Now I am created", 
                    "conversation_type": "group", "updated_at": 2000
                }],
                "updated": [], "deleted": []
            }
        },
        "last_pulled_at": 1500
    }
    res_push = client.post("/sync/push", json=payload_create_existing, headers=auth_header)
    assert res_push.status_code == 200
    
    # Verify the title changed to the newest version
    res_final = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    created_list = res_final.json()["changes"]["conversations"]["created"]
    record = next(c for c in created_list if c["id"] == record_id)
    assert record["title"] == "Now I am created"


def test_sync_conflict_detection(client: TestClient, auth_header):
    """
    Requirement: If record modified on server AFTER last_pulled_at, MUST abort (409).
    """
    record_id = str(uuid4())
    
    # 1. Create a record on server
    client.post("/sync/push", json={
        "changes": {"conversations": {"created": [{
            "id": record_id, "title": "Server Version", "conversation_type": "group", "updated_at": 5000
        }], "updated": [], "deleted": []}},
        "last_pulled_at": 0
    }, headers=auth_header)

    # 2. Try to update it using an OLD last_pulled_at (e.g., 2000)
    # Since 5000 > 2000, this is a conflict.
    payload_conflict = {
        "changes": {
            "conversations": {
                "created": [],
                "updated": [{"id": record_id, "title": "Conflicting Version", "updated_at": 6000}],
                "deleted": []
            }
        },
        "last_pulled_at": 2000 
    }
    
    response = client.post("/sync/push", json=payload_conflict, headers=auth_header)
    
    # Should fail with 409 (Conflict)
    assert response.status_code == 409


def test_sync_transactional_integrity(client: TestClient, auth_header):
    """
    Requirement: If one part fails, ALL must revert.
    """
    valid_id = str(uuid4())
    invalid_id = "not-a-uuid" # This should trigger an error in cast_to_uuids or DB
    
    # Attempt to create one valid conversation and one invalid message
    # Because of the invalid ID, the whole transaction should rollback.
    payload = {
        "changes": {
            "conversations": {
                "created": [{"id": valid_id, "title": "Should Rollback", "conversation_type": "solo", "updated_at": 100}],
                "updated": [], "deleted": []
            },
            "messages": {
                "created": [{"id": invalid_id, "content": "Fail", "updated_at": 100}],
                "updated": [], "deleted": []
            }
        },
        "last_pulled_at": 0
    }
    
    client.post("/sync/push", json=payload, headers=auth_header)

    # Verify that the 'Should Rollback' conversation does NOT exist
    res = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    created_convs = [c["id"] for c in res.json()["changes"]["conversations"]["created"]]
    assert valid_id not in created_convs


def test_sync_sanitation(client: TestClient, auth_header):
    """
    Requirement: Ignore _status and _changed fields.
    """
    record_id = str(uuid4())
    payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": record_id,
                    "title": "Clean Record",
                    "conversation_type": "solo",
                    "updated_at": 1000,
                    "_status": "synced",    # Should be ignored
                    "_changed": "title",    # Should be ignored
                    "non_existent_field": "ignore me" # Should be ignored by hasattr check
                }],
                "updated": [], "deleted": []
            }
        },
        "last_pulled_at": 0
    }
    
    response = client.post("/sync/push", json=payload, headers=auth_header)
    assert response.status_code == 200
    
    # Check pull to ensure no crash and data is clean
    res = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    record = res.json()["changes"]["conversations"]["created"][0]
    assert "_status" not in record
    assert "non_existent_field" not in record
