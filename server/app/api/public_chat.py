from typing import Annotated, Optional

from sqlmodel import desc, select

from app.db_operations.auth import SessionDep
from fastapi import Depends
from fastapi.routing import APIRouter

from app.db_operations.token import get_current_user
from app.models.users import User
from app.models.message import Message


router = APIRouter(
    prefix='/public-chat',
    tags=['public chat'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get('')
def get_public_chats(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    limit: int = 100,
    before: Optional[int] = None,
):
    stmt = (
        select(Message, User)
        .join(User, User.id == Message.sender_id, isouter=True)
        .where(Message.conversation_id.is_(None))
        .where(Message.is_deleted == False)
    )
    if before is not None:
        stmt = stmt.where(Message.created_at < before)
    stmt = stmt.order_by(desc(Message.created_at)).limit(limit)

    rows = session.exec(stmt).all()

    result = []
    for msg, sender in rows:
        result.append({
            "id": str(msg.id),
            "content": msg.content,
            "is_deleted": msg.is_deleted,
            "sender_id": str(msg.sender_id),
            "sender_first_name": sender.first_name if sender else None,
            "sender_last_name": sender.last_name if sender else None,
            "sender_username": sender.username if sender else None,
            "created_at": msg.created_at,
        })

    oldest_created_at = result[-1]["created_at"] if result else None

    return {
        "messages": result,
        "limit": limit,
        "oldest_created_at": oldest_created_at,
    }
