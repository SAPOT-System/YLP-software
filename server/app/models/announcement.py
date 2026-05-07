from enum import Enum
import uuid
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

# This prevents circular imports if your User model is in a different file
if TYPE_CHECKING:
    from app.models.users import User

if TYPE_CHECKING:
    from app.models.users import User


class PriorityType(str, Enum):
    low = 'low'
    normal = 'normal'
    high = 'high'

class AnnouncementStatusType(str, Enum):
    active = 'active'
    expired = 'expired'

class AudienceType(str, Enum):
    admin = "admin"
    user = "user"
    rescuer = "rescuer"

class Announcement(SQLModel, table=True):
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")

    title: str = Field(max_digits=50)
    content: str
    priority: PriorityType
    status: AnnouncementStatusType
    expires_at: datetime
    target_audience: AudienceType
    
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True
    )

    user: Optional['User'] = Relationship(
        back_populates='announcements'
    )

