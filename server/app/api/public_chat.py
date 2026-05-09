from typing import Annotated

from sqlmodel import desc, select

from app.db_operations.auth import SessionDep
from fastapi import Depends
from fastapi.routing import APIRouter
import time

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
    offset: int = 0
):
    stmt = select(Message).where(
        Message.conversation_id == None
    ).order_by(desc(Message.created_at)).offset(offset).limit(limit)

    res = session.exec(stmt).all()
    
    return {
        "messages": res,
        "limit": limit,
        "offset": offset
    }
