import uuid
from datetime import datetime
from sqlmodel import SQLModel, Field

class BlacklistedToken(SQLModel, table=True):
    # Using uuid.UUID as the type for the primary key
    jti: uuid.UUID = Field(primary_key=True, index=True)
    expires_at: datetime = Field(nullable=False)
