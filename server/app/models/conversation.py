#!/usr/bin/env python3

from datetime import datetime, timezone

from enum import Enum, auto
from typing import Annotated, List, Literal, Optional
from uuid import UUID, uuid4
from sqlmodel import BigInteger, Field, Relationship, SQLModel, table

from typing import TYPE_CHECKING

from app.models.message import SyncableModel, now_ms
if TYPE_CHECKING:
    from app.models.users import User
    from app.models.message import Message
    from app.models.call import Call

class ConversationType(str, Enum):
    direct = 'direct'
    # group = 'group'
    solo = 'solo'
    sms = 'sms'

class Conversation(SyncableModel, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, primary_key=True, index=True)
    title : str = Field(max_length=100, min_length=2)
    conversation_type : ConversationType = Field(max_length=100, min_length=2)

    messages: List['Message'] = Relationship(
        back_populates='conversation',
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan", # The magic string
            }
    )

    calls: List['Call'] = Relationship(
        back_populates='conversation',
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan", # The magic string
            }
    )

    conversationparticipants: List['ConversationParticipant'] = Relationship(
        back_populates='conversation',
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan", # The magic string
            }
    )


class  ConversationParticipant(SyncableModel, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, index=True, primary_key=True)
    # foreign keys
    conversation_id: UUID | None = Field(default=None, index=True, foreign_key='conversation.id', ondelete="CASCADE")
    user_id: UUID  = Field(index=True, foreign_key='user.id', ondelete="CASCADE")
    joined_at: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(),
        nullable=False,
    )
    is_deleted : bool = False

    user: List['User'] = Relationship(
        back_populates="conversation_participants"
    )

    conversation: Optional["Conversation"] = Relationship(
        back_populates="conversationparticipants"
    )
