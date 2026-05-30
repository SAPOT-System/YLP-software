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
from app.models.guest import Guest
from app.tests.conftest import sample_ids_with_test_user

def test_push_create_records(client: TestClient, auth_header, sample_ids, session: SessionDep):
    payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": sample_ids["conv_id"],
                    "title": "New Test Chat",
                    "conversation_type": "solo",
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
                    "conversation_type": "solo",
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


def test_sync_full_cycle(client: TestClient, auth_header, sample_ids_with_test_user, test_user):
    """
    Full sync cycle:

    1. PUSH: Create conversation + participant (ensures visibility).
    2. PULL: Get baseline timestamp.
    3. PUSH: Update conversation + create message (future timestamp).
    4. PULL: Verify correct changes are returned.
    """

    conv_id = str(uuid4())
    msg_id = str(uuid4())
    participant_id = str(uuid4())

    user_id = str(test_user["id"])

    # --- STEP 1: PUSH CREATED DATA ---
    push_create_payload = {
        "changes": {
            "conversations": {
                "created": [{
                    "id": conv_id,
                    "title": "Initial Title",
                    "conversation_type": "solo",
                    "created_at": 1712234000000,
                    "updated_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            "conversation_participants": {
                "created": [{
                    "id": participant_id,
                    "conversation_id": conv_id,
                    "user_id": user_id,
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }

    res_push_1 = client.post("/sync/push", json=push_create_payload, headers=auth_header)
    assert res_push_1.status_code == 200

    # --- STEP 2: INITIAL PULL ---
    res_pull_1 = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)

    assert res_pull_1.status_code == 200

    baseline_timestamp = res_pull_1.json()["timestamp"]

    # --- STEP 3: PUSH UPDATED + NEW MESSAGE ---
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
                    "sender_id": user_id,
                    "created_at": future_now,
                    "updated_at": future_now,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": baseline_timestamp
    }

    res_push_2 = client.post("/sync/push", json=push_update_payload, headers=auth_header)
    assert res_push_2.status_code == 200

    # --- STEP 4: FINAL PULL ---
    res_pull_final = client.get(
        f"/sync/pull?last_pulled_at={baseline_timestamp}",
        headers=auth_header
    )
    assert res_pull_final.status_code == 200

    body = res_pull_final.json()
    data = body["changes"]

    # --- ASSERTIONS ---

    # Conversation updated
    
    print("DATA", data)
    assert len(data["conversations"]["updated"]) == 1
    updated_conv = data["conversations"]["updated"][0]
    assert updated_conv["id"] == conv_id
    assert updated_conv["title"] == "Updated Title"

    # Message created (visible due to participant)
    assert len(data["messages"]["created"]) == 1
    created_msg = data["messages"]["created"][0]
    assert created_msg["id"] == msg_id
    assert created_msg["content"] == "New Message"

    # Timestamp advanced
    assert body["timestamp"] > baseline_timestamp


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
                    "conversation_type": "solo", # Required by your schema
                    "updated_at": 1000,
                    "created_at": 1000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            # Include other tables as empty to avoid potential parsing errors
            "messages": {"created": [], "updated": [], "deleted": []},
            "conversation_participants": {"created": [{
                    "id": str(uuid4()),
                    "conversation_id": record_id,
                    "user_id": str(sample_users.get("test")["id"]).replace("-", ""),
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }], "updated": [], "deleted": []},
            "calls": {"created": [], "updated": [], "deleted": []},
            "call_participants": {"created": [], "updated": [], "deleted": []},
            "message_receipts": {"created": [], "updated": [], "deleted": []}
        },
        "last_pulled_at": 500
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
    res = client.get("/sync/pull?last_pulled_at=999", headers=auth_header)
    data = res.json()
    
    print("PULL JSON:", data)
    
    deleted_list = data["changes"]["conversations"]["deleted"]
    
    # Validation
    assert record_id in deleted_list
    # Also verify it's NOT in 'created' or 'updated' since it's deleted
    created_ids = [c["id"] for c in data["changes"]["conversations"]["created"]]
    assert record_id not in created_ids

def test_sync_upsert_logic(client: TestClient, auth_header, test_user):
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
            },
            "conversation_participants": {
                "created": [{
                    "id": str(uuid4()),
                    "conversation_id": record_id,
                    "user_id": str(test_user["id"]),
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
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
                    "conversation_type": "solo", "updated_at": 2000
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


def test_sync_conflict_detection(client: TestClient, auth_header, test_user, session: SessionDep):
    """
    Requirement: If record modified on server AFTER last_pulled_at, the conflicting record
    is skipped (server wins) and the rest of the batch succeeds with 200.
    """
    record_id = str(uuid4())

    # 1. Create a record on server (updated_at will be set by server, but seed it at 5000)
    client.post("/sync/push", json={
        "changes": {
            "conversations": {"created": [{
                "id": record_id, "title": "Server Version", "conversation_type": "solo",
                "updated_at": 5000, "created_at": 5000
            }], "updated": [], "deleted": []},
            "conversation_participants": {
                "created": [{
                    "id": str(uuid4()),
                    "conversation_id": record_id,
                    "user_id": str(test_user["id"]),
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
        },
        "last_pulled_at": 0
    }, headers=auth_header)

    # 2. Try to update it using an OLD last_pulled_at (2000).
    # The server record has updated_at > 2000 — conflict — so the update is skipped.
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

    # Batch succeeds — conflict is silently skipped, server version preserved.
    assert response.status_code == 200

    session.expire_all()
    record = session.get(Conversation, UUID(record_id))
    assert record is not None
    assert record.title == "Server Version"  # server version unchanged

    # Convergence: the skip must bump updated_at past the conflicting push's last_pulled_at so the
    # client re-pulls the authoritative version on the next cycle (otherwise it diverges silently).
    assert record.updated_at > 2000

    res = client.get("/sync/pull?last_pulled_at=6000", headers=auth_header)
    updated_list = res.json()["changes"]["conversations"]["updated"]
    pulled = next((c for c in updated_list if c["id"] == record_id), None)
    assert pulled is not None, "skipped record was not re-delivered on next pull"
    assert pulled["title"] == "Server Version"


def test_sync_delete_conflict_converges(client: TestClient, auth_header, test_user, session: SessionDep):
    """
    A client pushing an update to a record the server already deleted is skipped, but updated_at is
    bumped so the deletion is re-pulled (in `deleted`) and the client removes it locally.
    """
    record_id = str(uuid4())

    # 1. Create then soft-delete the record on the server.
    client.post("/sync/push", json={
        "changes": {
            "conversations": {"created": [{
                "id": record_id, "title": "Doomed", "conversation_type": "solo",
                "updated_at": 5000, "created_at": 5000,
            }], "updated": [], "deleted": []},
            "conversation_participants": {
                "created": [{
                    "id": str(uuid4()),
                    "conversation_id": record_id,
                    "user_id": str(test_user["id"]),
                    "joined_at": 1712234000000,
                    "is_deleted": False,
                }],
                "updated": [],
                "deleted": [],
            },
        },
        "last_pulled_at": 0,
    }, headers=auth_header)

    client.post("/sync/push", json={
        "changes": {
            "conversations": {"created": [], "updated": [], "deleted": [record_id]},
        },
        "last_pulled_at": 0,
    }, headers=auth_header)

    # 2. A stale client (last_pulled_at=2000) pushes an update — server skips it.
    response = client.post("/sync/push", json={
        "changes": {
            "conversations": {
                "created": [],
                "updated": [{"id": record_id, "title": "Revived?", "updated_at": 6000}],
                "deleted": [],
            }
        },
        "last_pulled_at": 2000,
    }, headers=auth_header)
    assert response.status_code == 200

    session.expire_all()
    record = session.get(Conversation, UUID(record_id))
    assert record is not None
    assert record.is_deleted is True
    assert record.title == "Doomed"  # update did not take

    # Convergence: deletion is re-pulled so the client removes the record.
    res = client.get("/sync/pull?last_pulled_at=6000", headers=auth_header)
    assert record_id in res.json()["changes"]["conversations"]["deleted"]


def test_sync_transactional_integrity(client: TestClient, auth_header, test_user):
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
            },
            "conversation_participants": {
                "created": [{
                    "id": str(uuid4()),
                    "conversation_id": valid_id,
                    "user_id": str(test_user["id"]), 
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }
    
    client.post("/sync/push", json=payload, headers=auth_header)

    # Verify that the 'Should Rollback' conversation does NOT exist
    res = client.get("/sync/pull?last_pulled_at=0", headers=auth_header)
    created_convs = [c["id"] for c in res.json()["changes"]["conversations"]["created"]]
    assert valid_id not in created_convs


def test_sync_sanitation(client: TestClient, auth_header, test_user):
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
            },
            "conversation_participants": {
                "created": [{
                    "id": str(uuid4()),
                    "conversation_id": record_id,
                    "user_id": str(test_user["id"]),
                    "joined_at": 1712234000000,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
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


def test_pull_initial_sync_returns_created_records(
    client: TestClient,
    auth_header,
    sample_ids_with_test_user,
    session: SessionDep,
):
    # First: create data directly (simulate already-synced DB state)
    conversation = Conversation(
        id=UUID(sample_ids_with_test_user["conv_id"]),
        title="Test Chat",
        conversation_type=ConversationType.direct,
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )

    message = Message(
        id=UUID(sample_ids_with_test_user["msg_id"]),
        content="Hello World",
        conversation_id=UUID(sample_ids_with_test_user["conv_id"]),
        sender_id=UUID(sample_ids_with_test_user["user_id"]),
        created_at=1712234500001,
        updated_at=1712234500001,
        is_deleted=False,
    )

    participant = ConversationParticipant(
        id=UUID(sample_ids_with_test_user["participant_id"]),
        user_id=UUID(sample_ids_with_test_user["user_id"]),
        conversation_id=UUID(sample_ids_with_test_user["conv_id"]),
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )

    session.add_all([conversation, message, participant])
    session.commit()

    # Pull with last_pulled_at = 0 (initial sync)
    response = client.get(
        "/sync/pull",
        headers=auth_header,
        params={"last_pulled_at": 0},
    )

    assert response.status_code == 200
    data = response.json()

    assert "changes" in data

    # Conversations should appear in "created"
    assert len(data["changes"]["conversations"]["created"]) == 1
    assert data["changes"]["conversations"]["created"][0]["id"] == sample_ids_with_test_user["conv_id"]

    # Messages should appear in "created"
    assert len(data["changes"]["messages"]["created"]) == 1
    assert data["changes"]["messages"]["created"][0]["id"] == sample_ids_with_test_user["msg_id"]


def test_pull_incremental_returns_updated_records(
    client: TestClient,
    auth_header,
    sample_ids_with_test_user,
    session: SessionDep,
):
    # Create initial record
    conversation = Conversation(
        id=UUID(sample_ids_with_test_user["conv_id"]),
        title="Old Title",
        conversation_type="direct",
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )

    participant = ConversationParticipant(
        id=UUID(sample_ids_with_test_user["participant_id"]),
        user_id=UUID(sample_ids_with_test_user["user_id"]),
        conversation_id=UUID(sample_ids_with_test_user["conv_id"]),
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )
    
    session.add(conversation)
    session.add(participant)
    session.commit()

    # Update it later
    conversation.title = "Updated Title"
    conversation.updated_at = 1712234600000
    session.add(conversation)
    session.commit()

    # Pull after original timestamp
    response = client.get(
        "/sync/pull",
        headers=auth_header,
        params={"last_pulled_at": 1712234550000},
    )

    assert response.status_code == 200
    data = response.json()
    print("data", data)
    updated = data["changes"]["conversations"]["updated"]

    assert len(updated) == 1
    assert updated[0]["title"] == "Updated Title"


def test_pull_returns_deleted_records(
    client: TestClient,
    auth_header,
    sample_ids_with_test_user,
    session: SessionDep,
):
    conversation = Conversation(
        id=UUID(sample_ids_with_test_user["conv_id"]),
        title="To be deleted",
        conversation_type="solo",
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )
    participant = ConversationParticipant(
        id=UUID(sample_ids_with_test_user["participant_id"]),
        user_id=UUID(sample_ids_with_test_user["user_id"]),
        conversation_id=UUID(sample_ids_with_test_user["conv_id"]),
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )
    
    session.add(participant)
    session.add(conversation)
    session.commit()

    # Soft delete
    conversation.is_deleted = True
    conversation.updated_at = 1712234700000
    session.add(conversation)
    session.commit()

    response = client.get(
        "/sync/pull",
        headers=auth_header,
        params={"last_pulled_at": 1712234600000},
    )

    assert response.status_code == 200
    data = response.json()

    deleted = data["changes"]["conversations"]["deleted"]

    assert sample_ids_with_test_user["conv_id"] in deleted


def test_pull_only_returns_user_scoped_data(
    client: TestClient,
    auth_header,
    sample_ids_with_test_user,
    session: SessionDep,
):
    # Conversation NOT linked to user
    other_conversation = Conversation(
        id=UUID(sample_ids_with_test_user["conv_id"]),
        title="Other Chat",
        conversation_type="direct",
        created_at=1712234500000,
        updated_at=1712234500000,
        is_deleted=False,
    )
    session.add(other_conversation)
    session.commit()

    # Pull
    response = client.get(
        "/sync/pull",
        headers=auth_header,
        params={"last_pulled_at": 0},
    )

    assert response.status_code == 200
    data = response.json()

    # Should NOT include unrelated conversation
    created = data["changes"]["conversations"]["created"]
    ids = [c["id"] for c in created]

    assert sample_ids_with_test_user["conv_id"] not in ids


def test_pull_pagination_messages(client: TestClient, auth_header, sample_ids, test_user):
    """
    Verifies pagination on /sync/pull:

    - Only `limit` items are returned
    - `has_more` is correct
    - `next_cursor` advances
    - No duplicate records across pages
    """

    user_id = str(test_user["id"])
    conv_id = str(uuid4())
    participant_id = str(uuid4())

    base_time = 1712234000000

    # --- STEP 1: Create conversation + participant ---
    client.post("/sync/push", json={
        "changes": {
            "conversations": {
                "created": [{
                    "id": conv_id,
                    "title": "Paginated Conv",
                    "conversation_type": "solo",
                    "created_at": base_time,
                    "updated_at": base_time,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            },
            "conversation_participants": {
                "created": [{
                    "id": participant_id,
                    "conversation_id": conv_id,
                    "user_id": user_id,
                    "joined_at": base_time,
                    "is_deleted": False
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }, headers=auth_header)

    # --- STEP 2: Create MANY messages with increasing timestamps ---
    total_messages = 5
    messages = []

    for i in range(total_messages):
        t = base_time + (i + 1) * 1000
        messages.append({
            "id": str(uuid4()),
            "content": f"msg-{i}",
            "conversation_id": conv_id,
            "sender_id": user_id,
            "created_at": t,
            "updated_at": t,
            "is_deleted": False
        })

    client.post("/sync/push", json={
        "changes": {
            "messages": {
                "created": messages,
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }, headers=auth_header)

    # --- STEP 3: First pull (limit = 2) ---
    res1 = client.get("/sync/pull?last_pulled_at=0&limit=2", headers=auth_header)
    assert res1.status_code == 200

    body1 = res1.json()
    msgs_page1 = body1["changes"]["messages"]

    assert len(msgs_page1["created"]) == 2
    assert msgs_page1["has_more"] is True
    assert msgs_page1["next_cursor"] is not None

    cursor1 = msgs_page1["next_cursor"]

    ids_page1 = {m["id"] for m in msgs_page1["created"]}

    # --- STEP 4: Second pull using cursor ---
    res2 = client.get(f"/sync/pull?last_pulled_at={cursor1}&limit=2", headers=auth_header)
    assert res2.status_code == 200

    body2 = res2.json()
    msgs_page2 = body2["changes"]["messages"]

    assert len(msgs_page2["created"]) == 2
    assert msgs_page2["has_more"] is True

    cursor2 = msgs_page2["next_cursor"]
    ids_page2 = {m["id"] for m in msgs_page2["created"]}

    # Ensure no overlap
    assert ids_page1.isdisjoint(ids_page2)

    # --- STEP 5: Final pull ---
    res3 = client.get(f"/sync/pull?last_pulled_at={cursor2}&limit=2", headers=auth_header)
    assert res3.status_code == 200

    body3 = res3.json()
    msgs_page3 = body3["changes"]["messages"]

    # Only 1 message left (5 total, paginated by 2)
    assert len(msgs_page3["created"]) == 1
    assert msgs_page3["has_more"] is False

    ids_page3 = {m["id"] for m in msgs_page3["created"]}

    # Ensure no overlap across all pages
    all_ids = ids_page1 | ids_page2 | ids_page3
    assert len(all_ids) == total_messages



def test_push_sync_creates_guest_account_for_unknown_user(
    client: TestClient,
    auth_header,
    sample_ids_with_test_user,
    session: Session,
):
    # 1. Setup: Create a conversation but NOT the guest user
    conv_id = str(uuid.uuid4())
    guest_user_id = str(uuid.uuid4())  # This ID does not exist in DB yet
    msg_id = str(uuid.uuid4())

    # Pre-populate the conversation so the message has somewhere to go
    conversation = Conversation(
        id=UUID(conv_id),
        title="Sync Test Chat",
        conversation_type="direct",
        created_at=1712234500000,
        updated_at=1712234500000,
    )
    session.add(conversation)
    session.commit()

    # 2. Prepare the Push Request Payload
    # We include a message from a user_id that the server has never seen
    payload = {
        "last_pulled_at": 1712234500000,
        "changes": {
            "conversations": {"created": [], "updated": [], "deleted": []},
            "messages": {
                "created": [
                    {
                        "id": msg_id,
                        "content": "Message from a ghost",
                        "conversation_id": conv_id,
                        "sender_id": guest_user_id, # This triggers ensure_user_exists
                        "created_at": 1712234600000,
                        "updated_at": 1712234600000,
                    }
                ],
                "updated": [],
                "deleted": []
            },
            "conversation_participants": {"created": [], "updated": [], "deleted": []},
            "calls": {"created": [], "updated": [], "deleted": []},
            "call_participants": {"created": [], "updated": [], "deleted": []},
            "message_receipts": {"created": [], "updated": [], "deleted": []},
        }
    }

    # 3. Execution
    response = client.post(
        "/sync/push",
        headers=auth_header,
        json=payload,
    )

    # 4. Assertions
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    # Verify User was created
    db_user = session.get(User, UUID(guest_user_id))
    assert db_user is not None
    assert db_user.username == f"guest_{guest_user_id}"

    # Verify Guest record was created
    db_guest = session.exec(select(Guest).where(Guest.user_id == UUID(guest_user_id))).first()
    assert db_guest is not None

    # Verify the message was saved successfully linked to the new guest
    db_msg = session.get(Message, UUID(msg_id))
    assert db_msg is not None
    assert db_msg.sender_id == UUID(guest_user_id)


def test_pull_returns_messages_with_null_conversation_id(
    client: TestClient, 
    auth_header, 
    test_user
):
    """
    Verifies that messages where conversation_id is None (public/system chats)
    are included in the pull response regardless of the user's participation.
    """
    user_id = str(test_user["id"])
    base_time = 1712234000000
    public_msg_id = str(uuid4())

    # --- STEP 1: Create a message with conversation_id as None ---
    # We push this directly to simulate it being in the database.
    # Depending on your model constraints, conversation_id must be nullable.
    client.post("/sync/push", json={
        "changes": {
            "messages": {
                "created": [{
                    "id": public_msg_id,
                    "content": "Public Announcement",
                    "sender_id": user_id,
                    "created_at": base_time + 1000,
                    "updated_at": base_time + 1000,
                }],
                "updated": [],
                "deleted": []
            }
        },
        "last_pulled_at": 0
    }, headers=auth_header)

    # --- STEP 2: Pull changes ---
    response = client.get(
        "/sync/pull", 
        headers=auth_header, 
        params={"last_pulled_at": 0}
    )

    assert response.status_code == 200
    data = response.json()
    
    messages = data["changes"]["messages"]["created"]
    print("Messages", messages)
    # --- STEP 3: Verify the Null Conversation ID message is present ---
    # Filter for our specific message ID
    target_msg = next((m for m in messages if m["id"] == public_msg_id), None)
    
    assert target_msg is not None, "Message with NULL conversation_id was not returned"
    assert target_msg["conversation_id"] is None
    assert target_msg["content"] == "Public Announcement"

    # --- STEP 4: Double check logic ---
    # Ensure that even if the user has NO conversation participants, 
    # the public message still flows through.
    res_no_convs = client.get("/sync/pull", headers=auth_header)
    assert any(m["id"] == public_msg_id for m in res_no_convs.json()["changes"]["messages"]["created"])
