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

def cast_to_uuids(model, datum: dict):
    # 1. ID is mandatory for both Created and Updated
    if "id" in datum and isinstance(datum["id"], str):
        datum["id"] = UUID(datum["id"])

    # 2. Use .get() or "in" checks for foreign keys
    # This prevents KeyErrors during partial updates
    
    if model is ConversationParticipant:
        if "conversation_id" in datum: datum["conversation_id"] = UUID(datum["conversation_id"])
        if "user_id" in datum: datum["user_id"] = UUID(datum["user_id"])
        
    elif model is Message:
        if "sender_id" in datum: datum["sender_id"] = UUID(datum["sender_id"])
        if "conversation_id" in datum: datum["conversation_id"] = UUID(datum["conversation_id"])
        
    elif model is Call:
        if "conversation_id" in datum: datum["conversation_id"] = UUID(datum["conversation_id"])
        if "initiator_id" in datum: datum["initiator_id"] = UUID(datum["initiator_id"])
        
    elif model is CallParticipant:
        if "conversation_id" in datum: datum["conversation_id"] = UUID(datum["conversation_id"])
        if "user_id" in datum: datum["user_id"] = UUID(datum["user_id"])
        
    elif model is MessageReceipt:
        if "user_id" in datum: datum["user_id"] = UUID(datum["user_id"])
        if "message_id" in datum: datum["message_id"] = UUID(datum["message_id"])
        
    return datum


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
    # for the create objects
    def save_to_db(model , data):
        if not data: 
            return
        for datum in data.created:
            cast_to_uuids(model, datum)
            record = session.get(model, datum["id"])

            if record:
                # 2. Update fields dynamically
                # Use .items() to loop through the incoming JSON data
                for key, value in record.model_dump().items():
                    # Only update if the attribute actually exists on the model
                    print("DATUM", datum[key])
                    if hasattr(record, key) and datum[key]:
                        setattr(record, key, datum[key])
                session.add(record)
                continue

            new_record = model(**datum)
            session.add(new_record)

        session.flush()

        for datum in data.updated:
            cast_to_uuids(model, datum)
            record = session.get(model, datum["id"])
            if not record:
                new_record = model(**datum)
                session.add(new_record)
                continue
            if record.is_deleted:
                raise HTTPException(404, "Record not found. Local state may be out of sync. Pull data from the server.")
            for key, value in datum.items():
                print("DATUM", datum[key])
                if hasattr(datum, key) and datum[key]:
                    setattr(record, key, datum[key])
            session.add(record)
        session.flush()
        
        for datum in data.deleted:
            datum = UUID(datum)
            record = session.get(model, datum)
            if not record:
                continue
            setattr(record, "is_deleted", True)
            session.add(record)
        session.flush()

    try:
        for model, data in data_table.items():
            save_to_db(model, data)

    except:
        raise HTTPException(404, "You local client may ba out of sync. Pull from the server first")

    # for updated block

    session.commit()
    return {"status": "ok"}
