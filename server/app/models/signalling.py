from uuid import UUID
from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class SDPData(BaseModel):
    sender: str
    to: str
    ipAddress: str
    port: int
    sdp: dict | None


class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "handshake", ]
    data: SDPData
