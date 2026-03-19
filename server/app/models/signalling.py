from uuid import UUID
from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class SDPData(BaseModel):
    sender: str
    to: str
    ipAddress: str
    port: int
    sdp: Optional[dict] = None
    # candidate: Optional[str | dict]
    address: Optional[str] = None
    candidate: Optional[str] = None
    component: Optional[str] = None
    foundation: Optional[str] = None
    priority:  Optional[int] = None
    protocol:  Optional[str] = None
    relatedPort:  Optional[int] = None
    sdpMid:  Optional[str] = None
    sdpMidIndex:  Optional[int] = None
    tcpType:  Optional[str] = None
    type:  Optional[str] = None
    usernameFragment:  Optional[str] = None


class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "handshake", ]
    data: SDPData
