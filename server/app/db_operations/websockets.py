
from uuid import UUID
from fastapi import WebSocket
from pydantic import ValidationError

from app.models.signalling import SignalMessage
from app.db_operations.token import verify_token
from app.db_operations.connection_manager import manager

async def authenticate_websocket(websocket: WebSocket, token: str) -> str:
    user_id = verify_token(token)

    if not user_id:
        await websocket.close(code=1008)
        raise Exception("Unauthorized")

    return user_id

def validate_sender(payload: SignalMessage, user_id: UUID) -> bool:
    return payload.from_user == user_id

async def relay_signal(user_id: UUID, payload: SignalMessage):
    message = {
        "type": payload.type,
        "from": user_id,
        "data": payload.data
    }

    # call-ended may not need data
    if payload.type == "call-ended":
        message.pop("data", None)

    await manager.send_to_user(payload.to, message)

def handle_disconnect(user_id: UUID):
    manager.disconnect(user_id)

async def receive_signal_message(websocket: WebSocket) -> SignalMessage|None:
    raw_payload = await websocket.receive_json()

    try:
        return SignalMessage(**raw_payload)
    except ValidationError:
        return None
