from uuid import UUID
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any

from app.models.call import StatusType
from app.models.message import MessageType

class data(BaseModel):
    from_user: str = Field(alias="from")
    to: str
    message: Optional[str] = None
    conversationId: Optional[str] = None
    messageId: Optional[str] = None
    sentAt: Optional[int] = None
    messageType: Optional[MessageType] = None
    status: Optional[StatusType] = None #StatusType.missed
    startTime: Optional[int] = None
    callId: Optional[str] = None


class MessageData(BaseModel):
    type: Literal['audio-call', 'chat', 'video-call', 'call-ended'] = Field(alias="type")
    data: data


