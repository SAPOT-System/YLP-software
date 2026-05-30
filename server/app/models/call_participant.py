
from uuid import UUID, uuid4
from sqlmodel import BigInteger, Field, Relationship, SQLModel
from datetime import datetime, timezone


from typing import TYPE_CHECKING, List

from app.models.message import SyncableModel, now_ms

if TYPE_CHECKING:
    from app.models.users import User
    from app.models.conversation import Conversation



class CallParticipant(SyncableModel, table=True):
    id : UUID | None = Field(default_factory=uuid4, primary_key=True, index=True)
    joined_at: int = Field(
        default_factory=now_ms,
        sa_type=BigInteger(),
        nullable=False,
    )

    left_at : int | None = Field(
        default=None,
        sa_type=BigInteger(),
    )


    # foreign keys
    call_id : UUID | None = Field(foreign_key='call.id', ondelete="CASCADE")
    user_id : UUID | None = Field(foreign_key='user.id', ondelete="CASCADE")

    user: List["User"] = Relationship(
        back_populates="callparticipants"
    )



# class MessageReceiptBase(SQLModel):
#     status : Literal['read', 'delivered', 'sent'] = 'sent'
#     updated_at : datetime.datetime | None = Field(default_factory=datetime.datetime.now)

#     # foreign keys
#     message_id : UUID = Field(foreign_key="message.id")
#     user_id : UUID = Field(foreign_key="user.id")


# class MessageReceipt(MessageReceiptBase, table=True):
#     id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)


# class AttachmentBase(SQLModel):
#     message_id : UUID = Field(foreign_key="message.id")
#     file_path : str = Field(max_length=255, min_length=1)
#     file_name : str = Field(max_length=200, min_length=1)
#     file_size : int
#     mime_type : str = Field(max_length=255, min_length=1)

# class Attachment(AttachmentBase, table=True):
#     id : UUID | None = Field(default_factory=uuid4, index=True, primary_key=True)
