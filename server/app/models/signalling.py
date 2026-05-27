from uuid import UUID
from pydantic import BaseModel
from typing import List, Literal, Optional, Dict, Any

from app.models.users import UserPublic

class SDPData(BaseModel):
    sender: str
    to: str
    # ipAddress and port are present on plaintext messages but omitted on
    # encrypted wire messages (where the SDP lives inside the `enc` blob).
    ipAddress: Optional[str] = None
    port: Optional[int] = None
    sdp: Optional[dict] = None
    # candidate: Optional[str | dict]
    address: Optional[str] = None
    candidate: Optional[dict] = None
    credential: Optional[dict] = None
    iceRestart: Optional[bool] = None
    reason: Optional[str] = None
    # Encrypted payload — present instead of sdp/candidate on encrypted messages
    enc: Optional[dict] = None
    


class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "handshake", ]
    data: SDPData


