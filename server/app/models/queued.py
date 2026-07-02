import datetime
from enum import Enum
from typing import Literal, Optional
import uuid
from sqlmodel import Column, Field, Relationship, SQLModel, String


class Queue(SQLModel, table=True):
    id: uuid.UUID | None = Field(index=True, unique=True, primary_key=True)
    to: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    payload_type: Literal['chat', 'call-ended', 'ack', 'seen'] = Field(
        sa_column=Column(String(6000))
    )
    data_id: str = Field(index=True)
    data: str = Field(
        sa_column=Column(String(6000))
        )
Queue.model_rebuild()
