from uuid import UUID
from pydantic import BaseModel
from typing import List, Literal, Optional, Dict, Any

from app.models.users import UserPublic

class SDPData(BaseModel):
    sender: str
    to: str
    ipAddress: str
    port: int
    sdp: Optional[dict] = None
    # candidate: Optional[str | dict]
    address: Optional[str] = None
    candidate: Optional[dict] = None
    iceRestart: Optional[bool] = None
    reason: Optional[str] = None
    


class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "handshake", ]
    data: SDPData


