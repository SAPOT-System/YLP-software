from enum import Enum
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from datetime import datetime, timezone

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.message import Message


class StatusType(str, Enum):
    READ = 'read'
    DELIVERED = 'delivered'
    SENT = 'sent'

class MessageReceipt(SQLModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
    status : StatusType
    updated_at : datetime | None = Field(default_factory=lambda: datetime.now(timezone.utc))

    # foreign keys
    message_id : UUID = Field(foreign_key="message.id")
    user_id : UUID = Field(foreign_key="user.id")

    user: Optional["User"] = Relationship(
        back_populates="messagereceipts"
    )

    message: Optional["Message"] = Relationship(
        back_populates="messagereceipt"
    )

# class AttachmentBase(SQLModel):
#     message_id : UUID = Field(foreign_key="message.id")
#     file_path : str = Field(max_length=255, min_length=1)
#     file_name : str = Field(max_length=200, min_length=1)
#     file_size : int
#     mime_type : str = Field(max_length=255, min_length=1)

# class Attachment(AttachmentBase, table=True):
#     id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
