from typing import Annotated
import time
from uuid import uuid4, UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel, Session, select
from app.models.call import Call
from app.models.conversation import ConversationParticipant, Conversation
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func, or_
from app.models.conversation import ConversationParticipant
from app.models.call import Call
from app.models.call_participant import CallParticipant
from app.db_operations.auth import SessionDep, authenticate_user, db_create_user, get_password_hash, update_user_password
from fastapi.routing import APIRouter
from uuid import UUID
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, col
from app.models.sync import SyncResponse, SyncRequest, SyncCheckResponse, PushSyncRequest, TableChanges

from app.db_operations.token import get_current_user
from app.models.users import User
from app.models.message import Message
from app.models.message_receipt import MessageReceipt
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
def pull_updates(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    # Watermelon sends last_pulled_at as milliseconds (int)
    last_pulled_at: int = Query(0), 
):
    pass

@router.get("/check", response_model=SyncCheckResponse)
async def check_for_updates(
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    last_pull: int = Query(0), # Changed from datetime to int
):
    pass

@router.post("/push")
async def push_local_data(
    data: PushSyncRequest,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    print(data)
    changes = data.changes
    data_table = {
            Conversation:  changes.get('conversations'), 
            Message:  changes.get('messages'), 
            ConversationParticipant:  changes.get('conversation_participants'), 
            Call:  changes.get('calls'), 
            CallParticipant:  changes.get('call_participants'), 
            MessageReceipt:  changes.get('message_receipts'), 
            }

    def save_to_db(model , data):
        if not data: 
            return
        for datum in data.created:
            new_record = model(**datum)
            session.add(new_record)

    for model, data in data_table.items():
        save_to_db(model, data)

    session.flush()

    session.commit()
    return {"status": "ok"}
