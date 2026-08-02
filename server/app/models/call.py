from enum import Enum
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4
from sqlmodel import BigInteger, Field, Relationship, SQLModel
from datetime import datetime, timezone

from app.models.message import SyncableModel, now_ms

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation
    from app.models.call_participant import CallParticipant


class CallType(str, Enum):
    audio = "audio"
    video = "video"


class StatusType(str, Enum):
    missed = "missed"
    completed = "completed"
    rejected = "rejected"
    busy = "busy"
    undefined = "undefined"


class Call(SyncableModel, table=True):
    id : UUID | None = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True
    )
    call_type : CallType
    status :  StatusType
    start_time: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(),
        nullable=False,
    )
    end_time: int | None = Field(
        sa_type=BigInteger(),
        nullable=False,
        default=None
    )

    # foreign keys
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id', ondelete="CASCADE")
    initiator_id : UUID  | None = Field(default=None, foreign_key='user.id', ondelete="CASCADE")

    user: List["User"] = Relationship(
        back_populates="calls"
    )

    conversation: Optional["Conversation"] = Relationship(
        back_populates="calls"
    )

    callparticipants: List["CallParticipant"] = Relationship(
        back_populates="call",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan", # The magic string
            }
    )


