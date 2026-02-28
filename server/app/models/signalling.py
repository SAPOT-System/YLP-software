from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class SignalMessage(BaseModel):
    type: Literal["offer", "answer", "ice-candidate", "call-ended"]
    to: str
    from_user: str
    data: Dict[str, Any]
