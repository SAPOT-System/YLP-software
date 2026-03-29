from typing import Annotated
from uuid import uuid4, UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
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
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, col
from app.models.sync import SyncResponse, SyncRequest, SyncCheckResponse, PushSyncRequest

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



@router.get("/check", response_model=SyncCheckResponse)
async def check_for_updates(
    current_user : Annotated[User, Depends(get_current_user)],
    session: SessionDep,
    last_sync: datetime = Query(...),
):
    # 1. Get user's conversation IDs
    conv_ids_stmt = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == current_user.id
    )
    user_conv_ids = session.exec(conv_ids_stmt).all()

    if not user_conv_ids:
        return {"has_updates": False, "new_items_count": 0}

    # 2. Count new messages
    msg_count_stmt = select(func.count(Message.id)).where(
        Message.conversation_id.in_(user_conv_ids),
        Message.updated_at > last_sync
    )
    new_msgs = session.exec(msg_count_stmt).one()

    # 3. Count new calls
    call_count_stmt = select(func.count(Call.id)).where(
        Call.conversation_id.in_(user_conv_ids),
        Call.updated_at > last_sync
    )
    new_calls = session.exec(call_count_stmt).one()

    total_new = new_msgs + new_calls

    return {
        "has_updates": total_new > 0,
        "new_items_count": total_new
    }



# @router.post("/push")
# async def push_local_data(
#     data: PushSyncRequest,
#     session: SessionDep,
#     current_user: Annotated[User, Depends(get_current_user)],
# ):
# # --- 1. Conversations ---
#     for conv_data in data.conversations:
#         # FORCE UUID OBJECT IMMEDIATELY
#         c_id = conv_data.id if isinstance(conv_data.id, UUID) else UUID(str(conv_data.id))

#         existing_conv = session.get(Conversation, c_id)
#         if not existing_conv:
#             # Create a dict, fix the ID, then create the Model
#             conv_dict = conv_data.model_dump()
#             conv_dict['id'] = c_id
#             session.add(Conversation(**conv_dict))

#     # --- 2. Participants ---
#     for part_data in data.conversation_participants:
#         p_id = part_data.id if isinstance(part_data.id, UUID) else UUID(str(part_data.id))
#         c_id = part_data.conversation_id if isinstance(part_data.conversation_id, UUID) else UUID(str(part_data.conversation_id))
#         u_id = part_data.user_id if isinstance(part_data.user_id, UUID) else UUID(str(part_data.user_id))

#         statement = select(ConversationParticipant).where(
#             ConversationParticipant.conversation_id == c_id,
#             ConversationParticipant.user_id == u_id
#         )
#         # This exec() triggers the autoflush of conversations added above
#         existing_part = session.exec(statement).first()

#         if not existing_part:
#             session.add(ConversationParticipant(
#                 id=p_id,
#                 conversation_id=c_id,
#                 user_id=u_id,
#                 joined_at=part_data.joined_at
#             ))

#     session.flush()

#     # 3. Security Check: Refresh the allowed IDs after syncing participants
#     conv_ids_stmt = select(ConversationParticipant.conversation_id).where(
#         ConversationParticipant.user_id == current_user.id
#     )
#     allowed_conv_ids = set(session.exec(conv_ids_stmt).all())

# # 4. Process Messages (SINGLE LOOP)
#     for msg_data in data.messages:
#         # Ensure we are comparing UUID to UUID
#         curr_msg_conv_id = msg_data.conversation_id
#         if isinstance(curr_msg_conv_id, str):
#             curr_msg_conv_id = UUID(curr_msg_conv_id)

#         if curr_msg_conv_id not in allowed_conv_ids:
#             continue

#         existing_msg = session.get(Message, UUID(msg_data.id))
#         if existing_msg:
#             existing_msg.content = msg_data.content
#             existing_msg.is_deleted = msg_data.is_deleted
#         else:
#             # Ensure ID is a UUID object, not a string
#             msg_id = msg_data.id
#             if isinstance(msg_id, str):
#                 msg_id = UUID(msg_id)

#             # Ensure Conversation ID is a UUID object
#             conv_id = msg_data.conversation_id
#             if isinstance(conv_id, str):
#                 conv_id = UUID(conv_id)

#             new_msg = Message(
#                 id=msg_id,  # Use the converted UUID
#                 content=msg_data.content,
#                 message_type=msg_data.message_type,
#                 conversation_id=conv_id, # Use the converted UUID
#                 sender_id=current_user.id,
#                 created_at=msg_data.created_at,
#                 updated_at=datetime.now(timezone.utc)
#             )
#             session.add(new_msg)

#     # 5. Process Calls (Similar logic)
#     for call_data in data.calls:
#         if call_data.conversation_id not in allowed_conv_ids:
#             continue
#         if not session.get(Call, call_data.id):
#             session.add(Call(**call_data.model_dump()))

#     session.commit()
#     return {"status": "success", "message": "Data reconciled"}


@router.post("/push")
async def push_local_data(
    data: PushSyncRequest,
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user)],
):
    for conversation_participant in data.conversation_participants:
        p_id = conversation_participant.id if isinstance(conversation_participant.id, UUID) else UUID(str(conversation_participant.id))
        c_id = conversation_participant.conversation_id if isinstance(conversation_participant.conversation_id, UUID) else UUID(str(conversation_participant.conversation_id))
        u_id = conversation_participant.user_id if isinstance(conversation_participant.user_id, UUID) else UUID(str(conversation_participant.user_id))

        statement = select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == c_id,
            ConversationParticipant.user_id == u_id
        )
        # This exec() triggers the autoflush of conversations added above
        existing_part = session.exec(statement).first()

        if not existing_part:
            session.add(ConversationParticipant(
                id=p_id,
                conversation_id=c_id,
                user_id=u_id,
                joined_at=datetime.fromisoformat(conversation_participant.joined_at.replace("Z", "+00:00"))
            ))
        session.flush()


    # 3. Security Check: Refresh the allowed IDs after syncing participants
    conv_ids_stmt = select(ConversationParticipant.conversation_id).where(
        ConversationParticipant.user_id == current_user.id
    )
    allowed_conv_ids = set(session.exec(conv_ids_stmt).all())

    for conv_data in data.conversations:
        # FORCE UUID OBJECT IMMEDIATELY
        c_id = conv_data.id if isinstance(conv_data.id, UUID) else UUID(str(conv_data.id))

        existing_conv = session.get(Conversation, c_id)
        if not existing_conv:
            # Create a dict, fix the ID, then create the Model
            cast_date = datetime.fromisoformat(conv_data.created_at.replace("Z", "+00:00"))
            setattr(conv_data, 'id', c_id)
            setattr(conv_data, 'created_at', cast_date)
            session.add(conv_data)

            # 4. Process Messages (SINGLE LOOP)
    for msg_data in data.messages:
        # Ensure we are comparing UUID to UUID
        curr_msg_conv_id = msg_data.conversation_id
        if isinstance(curr_msg_conv_id, str):
            curr_msg_conv_id = UUID(curr_msg_conv_id)

        if curr_msg_conv_id not in allowed_conv_ids:
            continue

        existing_msg = session.get(Message, UUID(msg_data.id))
        if existing_msg:
            existing_msg.content = msg_data.content
            existing_msg.is_deleted = msg_data.is_deleted
        else:
            # Ensure ID is a UUID object, not a string
            msg_id = msg_data.id
            created_date =  datetime.fromisoformat(msg_data.created_at.replace("Z", "+00:00"))
            if isinstance(msg_id, str):
                msg_id = UUID(msg_id)

            # Ensure Conversation ID is a UUID object
            conv_id = msg_data.conversation_id
            if isinstance(conv_id, str):
                conv_id = UUID(conv_id)

            new_msg = Message(
                id=msg_id,  # Use the converted UUID
                content=msg_data.content,
                message_type=msg_data.message_type,
                conversation_id=conv_id, # Use the converted UUID
                sender_id=current_user.id,
                created_at=created_date,
                updated_at=datetime.now(timezone.utc)
            )
            session.add(new_msg)

    # 5. Process Calls (Similar logic)
    for call_data in data.calls:
        # if call_data.conversation_id not in allowed_conv_ids:
        #     continue
        print("CALL", call_data)
        casted_id = UUID(call_data.id)
        casted_conversation_id = UUID(call_data.conversation_id)
        casted_initiator_id = UUID(call_data.initiator_id)
        casted_id = UUID(call_data.id)
        start_date =  datetime.fromisoformat(call_data.start_time.replace("Z", "+00:00"))
        end_date =  datetime.fromisoformat(call_data.end_time.replace("Z", "+00:00"))
        setattr(call_data, 'id', casted_id)
        setattr(call_data, 'conversation_id', casted_conversation_id)
        setattr(call_data, 'initiator_id', casted_initiator_id)
        setattr(call_data, 'start_time', start_date)
        setattr(call_data, 'end_time', end_date)
        if not session.get(Call, call_data.id):
            session.add(Call(**call_data.model_dump(exclude_unset=True)))


    for call_participant_data in data.call_participants:
        joined_date =  datetime.fromisoformat(call_participant_data.joined_at.replace("Z", "+00:00"))
        left_date = datetime.fromisoformat(call_participant_data.left_at.replace("Z", "+00:00")) if (call_participant_data.left_at) else None
        casted_id = UUID(call_participant_data.id)
        casted_conversation_id = UUID(call_participant_data.conversation_id)
        casted_user_id = UUID(call_participant_data.user_id)
        setattr(call_participant_data, 'id', casted_id)
        setattr(call_participant_data, 'user_id', casted_user_id)
        setattr(call_participant_data, 'conversation_id', casted_conversation_id)
        setattr(call_participant_data, 'joined_at', joined_date)
        setattr(call_participant_data, 'left_at', left_date)
        if not session.get(CallParticipant, call_participant_data.id):
            session.add(CallParticipant(**call_participant_data.model_dump()))


    for message_receipt in data.message_receipts:
        updated_at = datetime.fromisoformat(message_receipt.updated_at.replace("Z", "+00:00"))
        casted_id = UUID(message_receipt.id)
        casted_user_id = UUID(message_receipt.user_id)
        casted_message_id = UUID(message_receipt.message_id)
        setattr(message_receipt, 'id', casted_id)
        setattr(message_receipt, 'user_id', casted_user_id)
        setattr(message_receipt, 'message_id', casted_message_id)
        setattr(message_receipt, 'updated_at', updated_at)
        if not session.get(MessageReceipt, message_receipt.id):
            session.add(MessageReceipt(**message_receipt.model_dump()))
    session.commit()
    return {"status": "success", "message": "Data reconciled"}
