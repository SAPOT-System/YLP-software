import datetime
from typing import Optional
import uuid
from sqlmodel import Field, Relationship, SQLModel

class Queue(SQLModel, table=True):
    id: uuid.UUID | None = Field(index=True, unique=True, primary_key=True)
    to: Optional[uuid.UUID] = Field(default=None, foreign_key="user.id")
    data: str
