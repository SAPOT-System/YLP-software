
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation
    from app.models.message_receipt import MessageReceipt
    from app.models.attachment import Attachment

class MessageType(str, Enum):
    TEXT = 'text'
    ATTACHMENT = 'attachment'
    CALL_LOG = 'call_log'


class Message(SQLModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)

    message_type : MessageType
    content : str = Field(max_length=255, min_length=1)
    created_at : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted : bool = Field(default=False)

    # foreign_key
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
    sender_id : UUID | None = Field(default=None, foreign_key='user.id')

    user: Optional['User'] = Relationship(
        back_populates='messages'
    )

    conversation: Optional['Conversation'] = Relationship(
        back_populates='messages'
    )

    messagereceipt: Optional['MessageReceipt'] = Relationship(
        back_populates='message'
    )

    attachment: Optional['Attachment'] = Relationship(
        back_populates='message'
    )
