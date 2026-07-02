from sqlmodel import SQLModel, Field
from datetime import datetime
from typing import Optional


class PhonePasswordResetCode(SQLModel, table=True):
    __tablename__ = "phone_password_reset_code"

    id: Optional[int] = Field(default=None, primary_key=True)
    phone_number: str = Field(index=True)
    code: str = Field(index=True)
    expires_at: datetime
    used: bool = False
    attempts: int = Field(default=0)
