
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel, String
import time
from typing import Optional
from sqlmodel import SQLModel, Field, Column, BigInteger

if TYPE_CHECKING:
    from models.users import User
    from models.conversation import Conversation

class MessageType(str, Enum):
    text = 'text'
    file = 'file'
    call_log = 'call_log'
    sms = 'sms'


def now_ms():
    """Returns current UTC time in milliseconds."""
    return int(time.time() * 1000)

class SyncableModel(SQLModel):
    # Instead of sa_column=Column(...), specify the SA type directly
    # and use sa_column_kwargs for the 'onupdate' trigger.
    created_at: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(), 
        nullable=False
    )
    
    updated_at: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(),
        nullable=False,
        sa_column_kwargs={"onupdate": now_ms} # This creates a fresh trigger for every table
    )
    
    is_deleted: bool = Field(default=False, index=True)


class Message(SyncableModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)

    message_type : MessageType = Field(default=MessageType.text)
    content : str = Field(max_length=255, min_length=1)
    is_deleted : bool = Field(default=False)

    # foreign_key
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id', ondelete="CASCADE")
    sender_id : UUID | None = Field(default=None, foreign_key='user.id', ondelete="CASCADE")

    user: Optional['User'] = Relationship(
        back_populates='messages'
    )

    conversation: Optional['Conversation'] = Relationship(
        back_populates='messages'
    )


