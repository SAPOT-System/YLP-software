from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session, select, or_
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from uuid import UUID

from typing import TYPE_CHECKING
# if TYPE_CHECKING:
from app.models.message_receipt import MessageReceipt
from app.models.message import Message
from app.models.call import Call
from app.models.conversation import Conversation, ConversationParticipant
from app.models.call_participant import CallParticipant

class SyncCheckResponse(BaseModel):
    has_updates: bool
    new_items_count: int
    last_update_at: Optional[datetime] = None

# This schema is what the client sends
class SyncRequest(BaseModel):
    last_sync: Optional[datetime] = None
    limit: int = 100  # Number of items per type to return

# This schema is what the server returns
class SyncResponse(BaseModel):
    server_time: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    conversations: List['Conversation'] = []
    messages: List['Message']  = []
    calls: List['Call']  = []
    call_participants: List['CallParticipant']  = []
    message_receipts: List['MessageReceipt'] = []
    new_cursor: datetime
    has_more: bool = False


class PushSyncRequest(BaseModel):
    conversations: List['Conversation'] = []
    messages: List['Message']  = []
    conversation_participants: List['ConversationParticipant']  = []
    calls: List['Call']  = []
    call_participants: List['CallParticipant']  = []
    message_receipts: List['MessageReceipt'] = []
#
# SyncResponse.model_rebuild()
# SyncRequest.model_rebuild()
