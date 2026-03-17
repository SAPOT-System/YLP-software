
from enum import Enum
from uuid import UUID, uuid4
from sqlmodel import Field, Relationship, SQLModel
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from datetime import datetime, timezone

if TYPE_CHECKING:
    from app.models.message import Message

class Attachment(SQLModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
    message_id : UUID = Field(foreign_key="message.id")
    file_path : str = Field(max_length=255, min_length=1)
    file_name : str = Field(max_length=200, min_length=1)
    file_size : int
    mime_type : str = Field(max_length=255, min_length=1)

    message: Optional["Message"] = Relationship(
        back_populates="attachment"
    )
