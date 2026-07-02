
from uuid import UUID, uuid4
from fastapi import WebSocket
from pydantic import ValidationError
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.models.message import Message
from app.models.queued import Queue
from app.models.signalling import SignalMessage
from app.db_operations.token import verify_token
from app.db_operations.connection_manager import manager
from app.models.users import User
from app.models.websocketComms import MessageData, PublicMessageData

async def authenticate_websocket(websocket: WebSocket, token: str) -> UUID:
    user_id = verify_token(token)

    if not user_id:
        await websocket.close(code=1008)
        raise Exception("Unauthorized")

    return user_id

def validate_sender(payload: SignalMessage, user_id: UUID) -> bool:
    data = payload.data.model_dump()
    id = data.get('sender'), UUID
    if not isinstance(id, UUID):
        id = UUID(data.get('sender'))
    return str(id) == str(user_id)



def validate_message_sender(payload: dict, user_id: UUID) -> bool:
    data = payload
    id = data.get('from'), UUID
    if not isinstance(id, UUID):
        id = UUID(data.get('from'))
    return str(id) == str(user_id)

async def relay_signal(sender_id: UUID, target_id: UUID, payload: SignalMessage, session: SessionDep):
    import logging as _logging
    _log = _logging.getLogger(__name__)
    message = {
        "type": payload.type,
        "data": payload.data.model_dump(exclude_none=True)
    }
    if not isinstance(target_id, UUID):
        target_id = UUID(target_id)

    if await manager.is_user_connected(target_id):
        try:
            await manager.send_personal_message(target_id, message)
        except Exception as exc:
            _log.debug("[relay_signal] delivery failed target=%s: %s", target_id, exc)
    else:
        _log.debug("[relay_signal] receiver not connected target=%s", target_id)

async def relay_message_fails(sender_id: UUID, target_id: UUID, payload: MessageData, message, session:SessionDep):
    try:
        if payload.type not in ['chat', 'call-ended', 'ack', 'seen']:
            raise Exception()
        data_id = payload.data.messageId if payload.data.messageId else payload.data.conversationId
        existing = session.exec(
            select(Queue).where(Queue.data_id == data_id).where(Queue.to == target_id)
        ).first()
        if not existing:
            q = Queue(
                    id=uuid4(),
                    to=target_id,
                    data=str(message),
                    payload_type=payload.type,
                    data_id=data_id,
                    )
            session.add(q)
            session.commit()
            session.refresh(q)
        if payload.type in ['chat', 'call-ended', 'ack']:
            await manager.send_personal_message(sender_id, {
                "type": "server-ack",
                'data': {
                    "message_type": payload.type,
                    "messageId": payload.data.messageId,
                    "from": payload.data.from_user,
                    "to": payload.data.to
                }
            })
        elif payload.type == 'seen':
            await manager.send_personal_message(sender_id, {
                "type": "server-ack",
                'data': {
                    "message_type": payload.type,
                    "conversationId": payload.data.conversationId,
                    "from": payload.data.from_user,
                    "to": payload.data.to
                }
            })
    except Exception as e:
        print("here ack", e)
        pass


def delete_from_queue(queue: Queue, session: SessionDep):
    session.delete(queue)
    session.commit()


async def relay_message(sender_id: UUID, target_id: UUID, payload: MessageData, session: SessionDep):
    message = {
        "type": payload.type,
        "data": payload.data.model_dump(exclude_none=True, by_alias=True)
    }
    if not isinstance(target_id, UUID):
        target_id = UUID(target_id)

    if payload.type == 'ack':
        try:
            query = select(Queue).filter_by(data_id=payload.data.messageId)
            queued_data = session.exec(query).all()
            for data in queued_data:
                if not data:
                    continue
                if str(payload.data.from_user) != str(data.to):
                    continue
                delete_from_queue(data, session)
        except Exception as e:
            pass
        
    if await manager.is_user_connected(target_id):
        try:
            await manager.send_personal_message(target_id, message)
        except Exception:
            await relay_message_fails(sender_id, target_id, payload, message, session)
    else:
        await relay_message_fails(sender_id, target_id, payload, message, session)


async def relay_public_message(sender_id: UUID, payload: PublicMessageData, session: SessionDep):
    try:
        dump = payload.model_dump(exclude_unset=True)
        dump["sender_id"] = str(dump["sender_id"])

        message_to_db = Message(
            content=payload.content,
            is_deleted=payload.is_deleted,
            sender_id=payload.sender_id,
            conversation_id=None,
        )
        session.add(message_to_db)
        session.commit()
        session.refresh(message_to_db)

        dump["id"] = str(message_to_db.id)

        sender = session.get(User, sender_id if isinstance(sender_id, UUID) else UUID(str(sender_id)))
        if sender:
            dump["sender_first_name"] = sender.first_name
            dump["sender_last_name"] = sender.last_name
            dump["sender_username"] = sender.username

        await manager.broadcast(dump)
    except Exception as e:
        print(f"[relay_public_message] failed: {e}")
    

async def receive_signal_message(websocket: WebSocket) -> SignalMessage|dict:
    raw_payload = await websocket.receive_json()

    try:
        payload = SignalMessage(**raw_payload)
        return  payload
    except ValidationError:
        return raw_payload
