#!/usr/bin/env python3

import datetime
from enum import Enum, auto
from typing import Annotated, Literal
from uuid import UUID, uuid4
from sqlmodel import Field, SQLModel, table


class ConversationBase(SQLModel):
    title : str = Field(max_length=100, min_length=2)
    conversation_type : Literal['direct_message', 'group', 'solo'] = Field(max_length=100, min_length=2)
    created_at : datetime.datetime = Field(default_factory=datetime.datetime.now)


class Conversation(ConversationBase, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, primary_key=True, index=True)


class ConversationPublic(ConversationBase):
    id: UUID | None


class ConversationParticipantBase(SQLModel):
    role : Literal["initiator", "participant"]
    joined_at : datetime.datetime = Field(default_factory=datetime.datetime.now)
    is_deleted : bool = False
    # foreign keys
    user_id: UUID | None = Field(default=None, index=True, foreign_key='user.id')
    conversation_id: UUID | None = Field(default=None, index=True, foreign_key='conversation.id')


class  ConversationParticipant(ConversationParticipantBase, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, index=True, primary_key=True)


class MessageBase(SQLModel):
    message_type : Literal["text", "attachment", "call_log"]
    content : str = Field(max_length=255, min_length=1)
    created_at : datetime.datetime = Field(default_factory=datetime.datetime.now)
    is_deleted : bool = Field(default=False)

    # foreign_key
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
    sender_id : UUID | None = Field(default=None, foreign_key='user.id')


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


class Call(MessageBase, table=True):
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


class CallParticipant(CallParticipantBase):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)


class MessageReceiptBase(SQLModel):
    status : Literal['read', 'delivered', 'sent'] = 'sent'
    updated_at : datetime.datetime | None = Field(default_factory=datetime.datetime.now)

    # foreign keys
    message_id : UUID = Field(foreign_key="message.id")
    user_id : UUID = Field(foreign_key="user.id")


class MessageReceipt(MessageReceiptBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)


class AttachmentBase(SQLModel):
    message_id : UUID = Field(foreign_key="message.id")
    file_path : str = Field(max_length=255, min_length=1)
    file_name : str = Field(max_length=200, min_length=1)
    file_size : int
    mime_type : str = Field(max_length=255, min_length=1)
}

class Attachment(AttachmentBase, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
