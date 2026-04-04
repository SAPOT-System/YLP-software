import pytest
from fastapi.encoders import jsonable_encoder
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

# def test_sync_watermelon_incremental(client: TestClient, sync_data):
#     # 1. Setup Auth
#     sample_user = sample_users['test']
#     form_data = {
#         'username': sample_user.get('phone_number'),
#         'password': sample_user.get('password'),
#     }
#     auth_response = client.post('/auth/token', data=form_data)
#     token = auth_response.json()["access_token"]
#     headers = {"Authorization": f"Bearer {token}"}
#
#     # 2. Define the "Last Pulled" timestamp in milliseconds
#     # In your previous code, mid_ts was a datetime. 
#     # For Watermelon, we use the millisecond integer.
#     mid_ts_ms = int(sync_data["timestamps"]["mid"] * 1000)
#
#     # 3. Send the request using WatermelonDB query parameter name
#     response = client.get(
#         "/sync",
#         params={"last_pulled_at": mid_ts_ms},
#         headers=headers
#     )
#
#     # 4. Verify Protocol Compliance
#     assert response.status_code == 200
#     data = response.json()
#
#     # WatermelonDB expects a top-level 'changes' dictionary and a 'timestamp'
#     assert "changes" in data
#     assert "timestamp" in data
#     assert isinstance(data["timestamp"], int)
#
#     changes = data["changes"]
#
#     # 5. Verify Table Logic (Created vs Updated vs Deleted)
#     # Based on your logic: 
#     # - "New Message" was created after mid_ts -> 'created'
#     # - "Deleted Message" was updated (is_deleted=True) after mid_ts -> 'deleted'
#     # - "Old Message" was created/updated before mid_ts -> should not appear
#
#     msg_changes = changes.get("messages", {"created": [], "updated": [], "deleted": []})
#
#     # We expect 1 in 'created' (New Message) and 1 in 'deleted' (Deleted Message ID)
#     assert len(msg_changes["created"]) == 1
#     assert len(msg_changes["deleted"]) == 1
#     assert len(msg_changes["updated"]) == 0
#
#     # Check content of the created message
#     assert msg_changes["created"][0]["content"] == "New Message"
#
#     # Check the call log
#     call_changes = changes.get("calls", {"created": [], "updated": [], "deleted": []})
#     assert len(call_changes["created"]) == 1
