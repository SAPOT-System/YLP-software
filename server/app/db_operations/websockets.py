
from uuid import UUID
from fastapi import WebSocket
from pydantic import ValidationError

from app.models.signalling import SignalMessage
from app.db_operations.token import verify_token
from app.db_operations.connection_manager import manager

async def authenticate_websocket(websocket: WebSocket, token: str) -> UUID:
    user_id = verify_token(token)

    if not user_id:
        await websocket.close(code=1008)
        raise Exception("Unauthorized")

    return user_id

def validate_sender(payload: SignalMessage, user_id: UUID) -> bool:
    data = payload.data.model_dump()
    print("VALIDATE", str(UUID(data.get('sender'))) , str(user_id))
    return str(UUID(data.get('sender'))) == str(user_id)

async def relay_signal(sender_id: UUID, target_id: UUID, payload: SignalMessage):
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


async def receive_signal_message(websocket: WebSocket) -> SignalMessage|dict:
    raw_payload = await websocket.receive_json()

    try:
        payload = SignalMessage(**raw_payload)
        return  payload
    except ValidationError:
        return raw_payload
        print("ERRORR: receive signal message")
        return None
