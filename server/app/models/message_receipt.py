from enum import Enum
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from datetime import datetime, timezone

from app.models.message import SyncableModel

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.message import Message


class StatusType(str, Enum):
    read = 'read'
    delivered = 'delivered'
    sent = 'sent'

class MessageReceipt(SyncableModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
    status : StatusType

    # foreign keys
    message_id : UUID = Field(foreign_key="message.id")
    user_id : UUID = Field(foreign_key="user.id")

    user: Optional["User"] = Relationship(
        back_populates="messagereceipts"
    )

    message: Optional["Message"] = Relationship(
        back_populates="messagereceipt"
    )

