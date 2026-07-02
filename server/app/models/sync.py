from fastapi import APIRouter, Depends
from typing import List, Dict, TypeVar, Generic, Any, Optional
from pydantic import BaseModel, Field
from sqlmodel import Session, select, or_
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict
from uuid import UUID

from typing import TYPE_CHECKING
# if TYPE_CHECKING:
from app.models.message_receipt import MessageReceipt
from app.models.message import Message
from app.models.call import Call
from app.models.conversation import Conversation, ConversationParticipant
from app.models.call_participant import CallParticipant
from pydantic import BaseModel
from typing import List, Generic, TypeVar, Any

T = TypeVar("T")

class TablePush(BaseModel, Generic[T]):
    """Represents the changes for a single table."""
    created: List[T] = []
    updated: List[T] = []
    deleted: List[str] = [] # Array of UUID strings

class SyncCheckResponse(BaseModel):
    has_updates: bool
    new_items_count: int
    last_update_at: Optional[datetime] = None

# This schema is what the client sends
class SyncRequest(BaseModel):
    last_sync: Optional[datetime] = None
    limit: int = 100  # Number of items per type to return

class TableChanges(BaseModel):
    created: List[Any] = []
    updated: List[Any] = []
    deleted: List[str] = []

# This schema is what the server returns
class SyncResponse(BaseModel):
    changes: Dict[str, TableChanges]
    timestamp: int


class GuestUserHint(BaseModel):
    first_name: str
    last_name: str
    username: str

class PushSyncRequest(BaseModel):
    # Watermelon wraps all table data in a 'changes' key
    changes: Dict[str, TableChanges]

    # Watermelon also sends the timestamp of the last successful pull
    last_pulled_at: int

    # Real name hints for guest peers — used by ensure_user_exists to create
    # placeholder rows with actual names instead of "Guest"/"User" defaults.
    guest_users: Optional[Dict[str, GuestUserHint]] = None

    # If you want strict Pydantic validation instead of Dict[str, Any], use this:
    # changes: "SyncChanges"
    # last_pulled_at: int

class SyncChanges(BaseModel):
    conversations: TablePush['Conversation'] = Field(default_factory=TablePush)
    messages: TablePush['Message'] = Field(default_factory=TablePush)
    conversation_participants: TablePush['ConversationParticipant'] = Field(default_factory=TablePush)
    calls: TablePush['Call'] = Field(default_factory=TablePush)
    call_participants: TablePush['CallParticipant'] = Field(default_factory=TablePush)
    message_receipts: TablePush['MessageReceipt'] = Field(default_factory=TablePush)
#
# SyncResponse.model_rebuild()
# SyncRequest.model_rebuild()
