import uuid
from datetime import datetime, timezone
from typing import Optional, TYPE_CHECKING
from sqlmodel import SQLModel, Field, Relationship

# This prevents circular imports if your User model is in a different file
if TYPE_CHECKING:
    from app.models.users import User

class UserLocation(SQLModel, table=True):
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True
    )

    # Coordinates
    latitude: float = Field(nullable=False)
    longitude: float = Field(nullable=False)

    # Metadata
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        index=True # Crucial for fetching "latest" or "history by date"
    )

    # Relationship Link
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")

    # Back-reference to the User object
    user: Optional["User"] = Relationship(back_populates="locations")
