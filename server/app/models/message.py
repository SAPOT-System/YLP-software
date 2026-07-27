
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel, String
import time
from typing import Optional
from sqlmodel import SQLModel, Field, Column, BigInteger
from sqlalchemy import Text

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation
    from app.models.message_receipt import MessageReceipt
    from app.models.attachment import Attachment

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
        index=True,
        sa_column_kwargs={"onupdate": now_ms} # This creates a fresh trigger for every table
    )
    
    is_deleted: bool = Field(default=False, index=True)


class Message(SyncableModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)

    message_type : MessageType = Field(default=MessageType.text)
    # `content` holds either plaintext (public chat, capped at 2000 chars
    # client-side) or E2E-encrypted base64 ciphertext (1:1 chat), which is
    # significantly larger than the plaintext it encodes (nonce + MAC +
    # base64 expansion). A fixed VARCHAR length keeps getting outgrown by
    # legitimate ciphertext, so this column is unbounded TEXT instead.
    content : str = Field(sa_column=Column(Text, nullable=False), min_length=1)
    is_deleted : bool = Field(default=False)

    linked_message_id: UUID | None = Field(default=None, foreign_key='message.id', ondelete="SET NULL", nullable=True)

    # foreign_key
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id', ondelete="CASCADE", index=True)
    sender_id : UUID | None = Field(default=None, foreign_key='user.id', ondelete="CASCADE", index=True)

    user: Optional['User'] = Relationship(
        back_populates='messages'
    )

    conversation: Optional['Conversation'] = Relationship(
        back_populates='messages'
    )

    messagereceipt: Optional['MessageReceipt'] = Relationship(
        back_populates='message',
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan", # The magic string
            }
        )

    attachment: Optional['Attachment'] = Relationship(
        back_populates='message'
    )
