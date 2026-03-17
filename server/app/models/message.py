
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation

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




# class CallBase(SQLModel):
#     call_type : Literal['audio', 'video']
#     status :  Literal[ 'missed', 'completed', 'rejected', 'busy' ]
#     start_time: datetime.datetime | None = Field(default_factory=datetime.datetime.now)
#     end_time: datetime.datetime | None = Field(default=None)

#     # foreign keys
#     conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
#     initiator_id : UUID  | None = Field(default=None, foreign_key='user.id')


# class Call(MessageBase, table=True):
#     id : UUID | None = Field(
#         default_factory=uuid4,
#         primary_key=True,
#         index=True
#     )


# class CallParticipantBase(SQLModel):
#     joined_at : datetime.datetime = Field(default_factory=datetime.datetime.now)
#     left_at : datetime.datetime | None = None

#     # foreign keys
#     conversation_id : UUID | None = Field(foreign_key='conversation.id')
#     user_id : UUID | None = Field(foreign_key='user.id')


# class CallParticipant(CallParticipantBase):
#     id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)


# class MessageReceiptBase(SQLModel):
#     status : Literal['read', 'delivered', 'sent'] = 'sent'
#     updated_at : datetime.datetime | None = Field(default_factory=datetime.datetime.now)

#     # foreign keys
#     message_id : UUID = Field(foreign_key="message.id")
#     user_id : UUID = Field(foreign_key="user.id")


# class MessageReceipt(MessageReceiptBase, table=True):
#     id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)


# class AttachmentBase(SQLModel):
#     message_id : UUID = Field(foreign_key="message.id")
#     file_path : str = Field(max_length=255, min_length=1)
#     file_name : str = Field(max_length=200, min_length=1)
#     file_size : int
#     mime_type : str = Field(max_length=255, min_length=1)

# class Attachment(AttachmentBase, table=True):
#     id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
