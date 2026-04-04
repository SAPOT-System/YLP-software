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
from app.models.message import Message, SyncableModel
from app.models.message_receipt import MessageReceipt
from app.models.call import Call
from app.models.conversation import ConversationParticipant

import time
from typing import Type, List, Dict, Any
from uuid import UUID
from sqlmodel import select, col, and_
from fastapi import Depends

router = APIRouter(
    prefix='/sync',
    tags=['sync'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.get("/pull")
async def pull_remote_changes(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
    last_pulled_at: int = 0, 
):
    # 1. Capture the exact server time for the next sync cycle
    server_time = int(time.time() * 1000)

    def get_table_changes(model: Type[SyncableModel], filter_stmt=None) -> Dict[str, Any]:
        """Fetches changes for a specific table since last_pulled_at."""
        
        # Select records updated since last sync
        stmt = select(model).where(col(model.updated_at) > last_pulled_at)
        
        # Apply extra filters (e.g., only user's messages) if provided
        if filter_stmt is not None:
            stmt = stmt.where(filter_stmt)
            
        results = session.exec(stmt).all()

        created = []
        updated = []
        deleted = []
        print("MODEL", model, results)
        for record in results:
            # Prepare the dictionary for JSON
            # WatermelonDB needs all IDs (PK and FK) as strings
            data = record.model_dump()
            
            # Convert UUID objects to strings
            for key, value in data.items():
                if isinstance(value, UUID):
                    data[key] = str(value)

            # WatermelonDB Logic:
            # 1. If is_deleted is true -> Add ID to 'deleted' list
            print("COMPARISON", record.created_at, last_pulled_at, record.created_at > last_pulled_at)
            if record.is_deleted:
                deleted.append(str(record.id))
                
            # 2. If created_at > last_pulled_at -> It's brand new
            elif record.created_at > last_pulled_at:
                created.append(data)
                
            # 3. Otherwise -> It's an update to an existing record
            else:
                updated.append(data)

        return {
            "created": created, 
            "updated": updated, 
            "deleted": deleted
        }

    # 2. Define Scoped Changes (Privacy)
    # Note: You should filter these so users only see their own data
    changes = {
        "conversations": get_table_changes(Conversation),
        "messages": get_table_changes(Message),
        "conversation_participants": get_table_changes(ConversationParticipant),
        "calls": get_table_changes(Call),
        "call_participants": get_table_changes(CallParticipant),
        "message_receipts": get_table_changes(MessageReceipt),
    }

    # 3. Final WatermelonDB Response Format
    return {
        "changes": changes,
        "timestamp": server_time
    }


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


# sanitize this
@router.post("/push")
async def push_local_data(
    current_user: Annotated[User, Depends(get_current_user)],
    data: PushSyncRequest,
    session: SessionDep,
):
    changes = data.changes
    last_pulled_at = data.last_pulled_at or 0
    
    # Tables in order to respect Foreign Key constraints
    data_table = {
        Conversation: changes.get('conversations'),
        Message: changes.get('messages'),
        ConversationParticipant: changes.get('conversation_participants'),
        Call: changes.get('calls'),
        CallParticipant: changes.get('call_participants'),
        MessageReceipt: changes.get('message_receipts'),
    }

    try:
        for model, table_changes in data_table.items():
            if not table_changes:
                continue

            # --- 1. HANDLE CREATED & UPDATED (Upsert Logic) ---
            # Protocol: If created ID exists -> Update. If updated ID missing -> Create.
            all_upserts = table_changes.created + table_changes.updated
            
            for datum in all_upserts:
                cast_to_uuids(model, datum)
                record = session.get(model, datum["id"])

                if record:
                    # CONFLICT DETECTION: 
                    # If record was modified on server after user's last pull, abort.
                    if record.updated_at > last_pulled_at:
                        raise HTTPException(status_code=409, detail="Conflict: Record updated remotely.")

                    # If record is already deleted on server, Protocol says throw error on 'updated' block
                    # but usually, we just force a re-sync.
                    if record.is_deleted:
                        raise HTTPException(status_code=404, detail="Record deleted on server.")

                    # UPDATE existing record
                    for key, value in datum.items():
                        # Protocol: Ignore _status, _changed. Only update valid columns.
                        if key not in ["id", "_status", "_changed"] and hasattr(record, key):
                            setattr(record, key, value)
                    session.add(record)
                
                else:
                    # CREATE new record (if not found in 'updated' or 'created')
                    # Protocol: Sanitize data (handled by model validation/SQLModel)
                    new_record = model(**datum)
                    session.add(new_record)

            # --- 2. HANDLE DELETED ---
            for datum_id in table_changes.deleted:
                try:
                    target_uuid = UUID(datum_id) if isinstance(datum_id, str) else datum_id
                    record = session.get(model, target_uuid)
                    
                    if record:
                        record.is_deleted = True
                        record.updated_at = int(time.time() * 1000)
                        session.add(record)
                        
                        # TODO: (Optional) Delete descendants here if needed 
                        # e.g., if record is Conversation, delete Messages.
                except ValueError:
                    continue # Ignore invalid ID formats as per Protocol

            # Flush after each table to maintain FK integrity for the next table
            session.flush()

        # Finalize everything
        session.commit()
        return {"status": "ok"}

    except HTTPException as he:
        session.rollback()
        raise he
    except Exception as e:
        session.rollback()
        print(f"Sync Error: {e}")
        raise HTTPException(status_code=500, detail="Internal Sync Error")
