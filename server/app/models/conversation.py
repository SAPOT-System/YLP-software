#!/usr/bin/env python3

from datetime import datetime, timezone

from enum import Enum, auto
from typing import Annotated, List, Literal, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel, table

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from app.models.users import User
    from app.models.message import Message
    from app.models.call import Call
    from app.models.call_participant import CallParticipant

class ConversationType(str, Enum):
    DIRECT = 'direct_message'
    GROUP = 'group'
    SOLO = 'solo'

class Conversation(SQLModel, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, primary_key=True, index=True)
    title : str = Field(max_length=100, min_length=2)
    conversation_type : ConversationType = Field(max_length=100, min_length=2)
    created_at : datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    messages: List['Message'] = Relationship(
        back_populates='conversation'
    )

    calls: List['Call'] = Relationship(
        back_populates='conversation'
    )

    callparticipants: List['CallParticipant'] = Relationship(
        back_populates='conversation'
    )

    conversationparticipants: List['ConversationParticipant'] = Relationship(
        back_populates='conversation'
    )


class  ConversationParticipant(SQLModel, table=True):
    id: UUID | None = Field(default_factory=uuid4, unique=True, index=True, primary_key=True)
    # foreign keys
    conversation_id: UUID | None = Field(default=None, index=True, foreign_key='conversation.id')
    user_id: UUID  = Field(index=True, foreign_key='user.id')
    joined_at : datetime= Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted : bool = False

    user: List['User'] = Relationship(
        back_populates="conversation_participants"
    )

    conversation: Optional["Conversation"] = Relationship(
        back_populates="conversationparticipants"
    )
