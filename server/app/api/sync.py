from typing import Annotated
import time
from sqlalchemy import exists
from sqlmodel import select, col
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

from app.models.guest import Guest

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
    last_pulled_at: int = Query(default=0),
    # schema_version: int = Query(default=1),
    limit: int = Query(default=100)
    # Migration is usually passed as a JSON string in GET or handled via POST
):
    # 1. CONSISTENT TIME-MARKING
    # Mark the timestamp BEFORE querying starts to ensure no changes are missed 
    # in the next cycle if they occur during this execution.
    server_time = int(time.time() * 1000)

    def get_table_changes(model: Type[SyncableModel], ownershipFilter: Any) -> Dict[str, Any]:
        """Fetches changes for a specific table since last_pulled_at."""
        
        # 2. QUERY LOGIC
        if last_pulled_at == 0:
            # Initial sync: Fetch all records that are NOT deleted
            stmt = select(model).where(ownershipFilter, col(model.is_deleted) == False).order_by(col(model.updated_at)).limit(limit)
        else:
            # Incremental sync: Fetch anything updated since last pull
            stmt = select(model).where(ownershipFilter, col(model.updated_at) > last_pulled_at).order_by(col(model.updated_at)).limit(limit)

        results = session.exec(stmt).all()
        has_more = len(results) == limit
        next_cursor = results[-1].updated_at if results else None
        created = []
        updated = []
        deleted = []

        # 3. WHITELIST & SANITIZATION
        # Define fields to EXCLUDE from the final JSON (WatermelonDB internals)
        internal_fields = {"_status", "_changed", "user_id_internal"} # Add any others

        for record in results:
            # Convert record to dict and sanitize
            data = record.model_dump()
            
            # Remove internal fields and relationship proxies
            clean_data = {
                k: (str(v) if isinstance(v, UUID) else v) 
                for k, v in data.items() 
                if k not in internal_fields and not k.startswith('_')
            }

            # 4. CATEGORIZATION LOGIC
            if record.is_deleted:
                # If it's a deletion, Watermelon only wants the ID string
                deleted.append(str(record.id))
            elif last_pulled_at == 0 or record.created_at > last_pulled_at:
                # Brand new record
                created.append(clean_data)
            else:
                # Modification to existing record
                updated.append(clean_data)

        return {
            "created": created, 
            "updated": updated, 
            "deleted": deleted,
            "next_cursor": next_cursor,
            "has_more": has_more
        }

    # 5. SCOPED CHANGES (Collection Whitelist)
    # This ensures no arbitrary collection names are leaked.
    # Build the reusable subquery once
    my_conversation_ids = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == current_user.id
    )

    my_message_ids = select(Message.id).where(
        col(Message.conversation_id).in_(my_conversation_ids)
    )
    
    changes = {
        "conversations": get_table_changes(
            Conversation,
            col(Conversation.id).in_(my_conversation_ids)
        ),
        "messages": get_table_changes(
            Message,
            or_(
                col(Message.conversation_id).in_(my_conversation_ids),
                col(Message.conversation_id).is_(None)
            )
        ),
        "conversation_participants": get_table_changes(
            ConversationParticipant,
            col(ConversationParticipant.conversation_id).in_(my_conversation_ids)
        ),
        "calls": get_table_changes(
            Call,
            col(Call.conversation_id).in_(my_conversation_ids)
        ),
        "call_participants": get_table_changes(
            CallParticipant,
            col(CallParticipant.conversation_id).in_(my_conversation_ids)
        ),
        "message_receipts": get_table_changes(
            MessageReceipt,
            col(MessageReceipt.message_id).in_(my_message_ids)
        ),
    }
    
    # 6. RESPONSE FORMAT
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
        # Cache to avoid repeated DB hits for the same users
        existing_user_ids: set[UUID] = set()
        missing_user_ids: set[UUID] = set()
        def ensure_user_exists(user_id: UUID | None):
            if not user_id:
                return
            if not isinstance(user_id, UUID):
                user_id = UUID(user_id)
            # Already confirmed existing
            if user_id in existing_user_ids:
                return

            # Already checked and missing
            if user_id in missing_user_ids:
                return

            user = session.get(User, user_id)
        
            if user:
                existing_user_ids.add(user_id)
            else:
                missing_user_ids.add(user_id)
                # TODO
                # --- PLACEHOLDER: CREATE GUEST USER ---
                user = User(
                    id=user_id,
                    username=f"guest_{user_id}",
                    first_name="Guest",
                    last_name="User",
                    hashed_password="",
                )

                guest_role = Guest(
                    user_id=user_id
                )
                
                session.add(user)
                session.add(guest_role)
                existing_user_ids.add(user_id)
                # --------------------------------------

        for model, table_changes in data_table.items():
            if not table_changes:
                continue

            # --- 1. HANDLE CREATED & UPDATED (Upsert Logic) ---
            # Protocol: If created ID exists -> Update. If updated ID missing -> Create.
            all_upserts = table_changes.created + table_changes.updated
            
            for datum in all_upserts:
                # --- USER FK VALIDATION ---
                if model is Message:
                    ensure_user_exists(datum.get("sender_id"))
                elif model is ConversationParticipant:
                    ensure_user_exists(datum.get("user_id"))
                elif model is Call:
                    ensure_user_exists(datum.get("initiator_id"))
                elif model is CallParticipant:
                    ensure_user_exists(datum.get("user_id"))
                elif model is MessageReceipt:
                    ensure_user_exists(datum.get("user_id"))
                    # --- END USER FK VALIDATION ---

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
