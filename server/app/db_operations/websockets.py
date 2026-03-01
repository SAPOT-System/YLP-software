
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
    return str(UUID(payload.from_user)) == str(user_id)

async def relay_signal(user_id: UUID, target_id: UUID, payload: SignalMessage):
    message = {
        "type": payload.type,
        "from": str(user_id),
        "data": payload.data
    }

    # call-ended may not need data
    if payload.type == "call-ended":
        message.pop("data", None)

    if manager.active_connections.get(target_id):
        await manager.send_personal_message(target_id, message)
    else:
        raise Exception("Receiver not connected")


async def receive_signal_message(websocket: WebSocket) -> SignalMessage|None:
    raw_payload = await websocket.receive_json()

    try:
        return SignalMessage(**raw_payload)
    except ValidationError:
        return None
