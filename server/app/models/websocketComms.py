from uuid import UUID
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any, override
from datetime import datetime

from app.models.call import StatusType

class data(BaseModel):
    from_user: str = Field(alias="from")
    to: Optional[str] = None
    message: Optional[str] = None
    content: Optional[str] = None
    conversationId: Optional[str] = None
    messageId: Optional[str] = None
    sentAt: Optional[int|str|datetime] = None
    messageType: Optional[Literal["text", "file", "call_log"]] = None
    status: Optional[Literal["missed", "completed", 'rejected', 'busy', 'undefined']] = None #StatusType.missed
    startTime: Optional[int] = None
    callId: Optional[str] = None
    callerName: Optional[str] = None
    endedAt: Optional[int] = None
    durationSeconds: Optional[int] = None
    initiatorId: Optional[str] = None
    reason: Optional[str] = None
    senderProfile: Optional[dict] = None
    enabled: Optional[bool] = None


class MessageData(BaseModel):
    type: Literal['audio-call', 'chat', 'video-call', 'call-ended', 'call-ready', "call-rejected", "call-missed", "ack", "seen", "camera_toggle", "mic_toggle"] = Field(alias="type")
    data: data

class PublicMessageData(BaseModel):
    id: Optional[UUID] = None
    type: Literal["public-chat"] = Field(default="public-chat", alias="type")
    content : str = Field(max_length=255, min_length=1)
    is_deleted: bool = Field(default=False)
    conversation_id: None = None
    sender_id : UUID = Field(alias="from")
    sender_first_name: Optional[str] = None
    sender_last_name: Optional[str] = None
    sender_username: Optional[str] = None
