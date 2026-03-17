from enum import Enum
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel
from datetime import datetime, timezone

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation


class CallType(str, Enum):
    AUDIO = "audio"
    VIDEO = "video"


class StatusType(str, Enum):
    MISSED = "missed"
    COMPLETED = "completed"
    REJECTED = "rejected"
    BUSY = "busy"


class Call(SQLModel, table=True):
    id : UUID | None = Field(
        default_factory=uuid4,
        primary_key=True,
        index=True
    )
    call_type : CallType
    status :  StatusType
    start_time: datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: datetime | None = Field(default=None)

    # foreign keys
    conversation_id : UUID | None = Field(default=None, foreign_key='conversation.id')
    initiator_id : UUID  | None = Field(default=None, foreign_key='user.id')

    user: List["User"] = Relationship(
        back_populates="calls"
    )

    conversation: Optional["Conversation"] = Relationship(
        back_populates="calls"
    )


