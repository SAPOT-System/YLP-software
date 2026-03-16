#!/usr/bin/env python3

import datetime
from enum import Enum, auto
from typing import Annotated, List, Literal, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel, UniqueConstraint, table
from datetime import timezone

class ConversationType(str, Enum):
    DIRECT = "direct_message"
    GROUP = "group"
    SOLO = "solo"

class ConversationBase(SQLModel):
    title : str = Field(max_length=100, min_length=2)
    conversation_type : ConversationType = Field(max_length=100, min_length=2)
    created_at : datetime.datetime = Field(default_factory=datetime.datetime.now)

    conversation_participants: List["ConversationParticipant"] = Relationship(back_populates="conversation")
    messages: List["Message"] = Relationship(back_populates="conversation")
    calls: List["Call"] = Relationship(back_populates="conversation")
    call_participants: List["CallParticipant"] = Relationship(back_populates="conversation")

class Conversation(ConversationBase, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, primary_key=True, index=True)


class ConversationPublic(ConversationBase):
    id: UUID | None


class ConversationParticipantBase(SQLModel):
    # role is redundant, the purpose of this is to track if the user is a participant or not
    # role : Literal["initiator", "participant"]
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted : bool = False
    # foreign keys
    conversation_id: UUID | None = Field(default=None, index=True, foreign_key='conversation.id')
    user_id: UUID = Field(default=None, index=True, foreign_key='user.id')

    user: List['User'] = Relationship(back_populates="conversation_participants")
    conversation: List['Conversation'] = Relationship(back_populates="conversation_participants")

    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id"),
    )


class  ConversationParticipant(ConversationParticipantBase, table=True):
    id: UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)


class MessageBase(SQLModel):
    message_type : Literal["text", "attachment", "call_log"]
    content : str = Field(max_length=255, min_length=1)
    created_at : datetime.datetime = Field(default_factory=datetime.datetime.now)
    is_deleted : bool = Field(default=False)

    # foreign_key
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
    sender_id : UUID | None = Field(default=None, foreign_key='user.id')

    user: Optional['User'] = Relationship(back_populates="messages")
    conversation: Optional['Conversation'] = Relationship(back_populates="messages")
    message_receipt: Optional['MessageReceipt'] =  Relationship(back_populates="messages")
    attachment: Optional['Attachment'] =  Relationship(back_populates="messages")


class Message(MessageBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)


class CallBase(SQLModel):
    call_type : Literal['audio', 'video']
    status :  Literal[ 'missed', 'completed', 'rejected', 'busy' ]
    start_time: datetime.datetime | None = Field(default_factory=datetime.datetime.now)
    end_time: datetime.datetime | None = Field(default=None)

    # foreign keys
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
    initiator_id : UUID  | None = Field(default=None, foreign_key='user.id')

    user: List['User'] = Relationship(back_populates="calls")
    conversation: Optional['Conversation'] = Relationship(back_populates="calls")


class Call(CallBase, table=True):
    id : UUID | None = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True
    )


class CallParticipantBase(SQLModel):
    joined_at : datetime.datetime = Field(default_factory=datetime.datetime.now)
    left_at : datetime.datetime | None = None

    # foreign keys
    conversation_id : UUID | None = Field(foreign_key='conversation.id')
    user_id : UUID | None = Field(foreign_key='user.id')

    user: List['User'] = Relationship(back_populates="call_participants")
    conversation: Optional['Conversation'] = Relationship(back_populates="call_participants")



class CallParticipant(CallParticipantBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)


class MessageReceiptBase(SQLModel):
    status : Literal['read', 'delivered', 'sent'] = 'sent'
    updated_at : datetime.datetime | None = Field(default_factory=datetime.datetime.now)

    # foreign keys
    message_id : UUID = Field(foreign_key="message.id")
    user_id : UUID = Field(foreign_key="user.id")

    user: Optional['User'] = Relationship(back_populates="message_receipts")
    message: Optional['Message'] = Relationship(back_populates="message_receipts")



class MessageReceipt(MessageReceiptBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)


class AttachmentBase(SQLModel):
    message_id : UUID = Field(foreign_key="message.id")
    file_path : str = Field(max_length=255, min_length=1)
    file_name : str = Field(max_length=200, min_length=1)
    file_size : int
    mime_type : str = Field(max_length=255, min_length=1)

    message: Optional['Message'] = Relationship(back_populates="attachments")


class Attachment(AttachmentBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
