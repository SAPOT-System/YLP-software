
from uuid import UUID, uuid4
from fastapi import WebSocket
from pydantic import ValidationError

from app.db_operations.auth import SessionDep
from app.models.message import Message
from app.models.queued import Queue
from app.models.signalling import SignalMessage
from app.db_operations.token import verify_token
from app.db_operations.connection_manager import manager
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
    try: 
        message = {
            "type": payload.type,
            "data": payload.data.model_dump(exclude_none=True)
        }
        if not isinstance(target_id, UUID):
            target_id = UUID(target_id)

        if manager.active_connections.get(target_id):
            await manager.send_personal_message(target_id, message)
        else:
            raise Exception("Receiver not connected")
    except:
        pass

async def relay_message_fails(sender_id: UUID, target_id: UUID, payload: MessageData, message, session:SessionDep):
    try: 
        q = Queue(
                id=uuid4(),
                to=target_id,
                data=str(message)
                )
        session.add(q)
        session.commit()
        session.refresh(q)
        if payload.type == 'chat':
            await manager.send_personal_message(sender_id, { "type": "ack", 'data': {"messageId": payload.data.messageId, "from": payload.data.from_user, "to": payload.data.to}})
        elif payload.type in ['audio-call', 'video-call', 'call-ended']:
            await manager.send_personal_message(sender_id, { "type": "ack", 'data': {"callId": payload.data.callId, "from": payload.data.from_user, "to": payload.data.to}})
        else:
            await manager.send_personal_message(sender_id, { "type": "ack", 'data': {}})
    except:
        pass

async def relay_message(sender_id: UUID, target_id: UUID, payload: MessageData, session: SessionDep):
    message = {
        "type": payload.type,
        "data": payload.data.model_dump(exclude_none=True)
    }
    if not isinstance(target_id, UUID):
        target_id = UUID(target_id)
    
    if manager.active_connections.get(target_id):
        try:
            await manager.send_personal_message(target_id, message)
        except: 
            await relay_message_fails(sender_id, target_id, payload, message, session)
    else:
        await relay_message_fails(sender_id, target_id, payload, message, session)


async def relay_public_message(sender_id: UUID, payload: PublicMessageData, session: SessionDep):
    message = {
        "type": payload.type,
        "data": payload.data.model_dump(exclude_none=True)
    }
    await manager.broadcast(message)

async def receive_signal_message(websocket: WebSocket) -> SignalMessage|dict:
    raw_payload = await websocket.receive_json()

    try:
        payload = SignalMessage(**raw_payload)
        return  payload
    except ValidationError:
        return raw_payload
        print("ERRORR: receive signal message")
        return None
