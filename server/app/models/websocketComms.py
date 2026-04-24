from uuid import UUID
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any, override

from app.models.call import StatusType
from app.models.message import MessageType

class data(BaseModel):
    from_user: str = Field(alias="from")
    to: Optional[str] = None
    message: Optional[str] = None
    content: Optional[str]  
    conversationId: Optional[str] = None
    messageId: Optional[str] = None
    sentAt: Optional[int] = None
    messageType: Optional[MessageType] = None
    status: Optional[StatusType] = None #StatusType.missed
    startTime: Optional[int] = None
    callId: Optional[str] = None


class MessageData(BaseModel):
    type: Literal['audio-call', 'chat', 'video-call', 'call-ended', 'call-ready'] = Field(alias="type")
    data: data

class PublicMessageData(BaseModel):
    id: Optional[UUID] = None
    type: Literal["public-chat"] = Field(default="public-chat", alias="type")
    content : str = Field(max_length=255, min_length=1)
    is_deleted: bool = Field(default=False)
    conversation_id: None = None
    sender_id : UUID = Field(alias="from")
