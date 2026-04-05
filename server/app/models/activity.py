from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship, Column, JSON

# --- THE MODELS ---

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.users import User


class UserActivity(SQLModel, table=True):
    __tablename__ = "user_activity"
    
    user_id: UUID = Field(foreign_key="user.id", primary_key=True)
    last_active: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = Field(default="Inactive")
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    user: Optional[ "User" ] = Relationship(back_populates="activity")

class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"
    
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    action: str  # e.g., "login", "update_profile"
    entity_id: Optional[UUID] = None
    # We use a raw SQLAlchemy Column for JSON support in SQLModel
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
