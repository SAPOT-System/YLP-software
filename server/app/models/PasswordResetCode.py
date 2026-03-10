from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional

class PasswordResetCode(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    email: str = Field(index=True)
    code: str = Field(index=True)

    expires_at: datetime
    used: bool = False
    attempts: int = Field(default=0)
