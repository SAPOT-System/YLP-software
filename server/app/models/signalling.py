from uuid import UUID
from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class SDPData(BaseModel):
    sender: str
    to: str
    ipAddress: str
    port: int


class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "call-ended"]
    # to: str
    # from_user: str
    data: SDPData
