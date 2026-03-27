from typing import Annotated
from fastapi import Depends
from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash, update_user_password
from fastapi.routing import APIRouter
from uuid import UUID
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, col
from app.models.sync import SyncResponse, SyncRequest

from app.db_operations.token import get_current_user
from app.models.users import User
from app.models.message import Message
from app.models.call import Call
from app.models.conversation import ConversationParticipant


router = APIRouter(
    prefix='/sync',
    tags=['sync'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("/", response_model=SyncResponse)
def sync_data(
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    last_sync: Optional[datetime] = Query(None),
    limit: int = Query(50, le=100),
):
    current_user_id = current_user.id
    # If first time syncing, start from the beginning of time
    since = last_sync or datetime.fromtimestamp(0, tz=timezone.utc)

    # 1. Get Conversation IDs the user belongs to
    # (Important: only sync what the user is allowed to see)
    conv_ids_stmt = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == current_user_id
    )
    user_conv_ids = session.exec(conv_ids_stmt).all()

    # 2. Fetch Messages (Paginated)
    # We fetch limit + 1 to determine if there's another "page"
    msg_stmt = (
        select(Message)
        .where(
            Message.conversation_id.in_(user_conv_ids),
            Message.updated_at > since
        )
        .order_by(Message.updated_at.asc()) # Oldest updates first
        .limit(limit + 1)
    )
    messages = session.exec(msg_stmt).all()

    # 3. Determine Pagination logic
    has_more = len(messages) > limit
    # Trim the list to the actual limit
    sync_messages = messages[:limit]

    # 4. Fetch Calls (Same logic)
    call_stmt = (
        select(Call)
        .where(
            Call.conversation_id.in_(user_conv_ids),
            Call.updated_at > since
        )
        .order_by(Call.updated_at.asc())
        .limit(limit) # For simplicity, we usually paginate by the "heaviest" table (Messages)
    )
    sync_calls = session.exec(call_stmt).all()

    # 5. Set the new cursor
    # If we have messages, the next sync starts from the last message's timestamp
    # Otherwise, use the current server time
    if sync_messages:
        new_cursor = sync_messages[-1].updated_at
    else:
        new_cursor = datetime.now(timezone.utc)

    return SyncResponse(
        messages=sync_messages,
        calls=sync_calls,
        new_cursor=new_cursor,
        has_more=has_more
    )
