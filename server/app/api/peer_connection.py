from typing import Annotated
from fastapi import APIRouter, Depends, WebSocket
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.main import manager
from app.db_operations.token import verify_token
from app.models.signalling import SignalMessage
from fastapi import Query, WebSocketDisconnect
from app.db_operations.websockets import authenticate_websocket, validate_sender, relay_signal, handle_disconnect, receive_signal_message

router = APIRouter(
    prefix='/ws/sdp',
    tags=['websockets', 'peer connection'],
    responses={
        404: {'description': 'Not Found'}
    }
)

# model for payload
# {
#   "type": "offer" | "answer" | "ICE",
#   "to": str,
#   "from": str,
#   "sdp": dict
# }*
#

# sending an offer
# ws.send(JSON.stringify({
#   type: "offer",
#   from_user: currentUserId,
#   to: targetUserId,
#   data: offer
# }));
#
# sending an answer
# ws.send(JSON.stringify({
#   type: "answer",
#   from_user: currentUserId,
#   to: targetUserId,
#   data: answer
# }));
#
# ICE candidate
# ws.send(JSON.stringify({
#   type: "offer",
#   from_user: currentUserId,
#   to: targetUserId,
#   data: offer
# }));

# [ ] TODO add message statuses to types
# [ ] TODO update logs based on this
@router.websocket("/")
async def relay_sdp(
    websocket: WebSocket,
    token: str = Query(...)
):
    # 1️⃣ Authenticate
    user_id = await authenticate_websocket(websocket, token)

    # 2️⃣ Accept connection
    await manager.connect(user_id, websocket)

    try:
        while True:
            # 3️⃣ Receive + validate message
            payload = await receive_signal_message(websocket)

            if not payload:
                continue

            # 4️⃣ Prevent spoofing
            if not validate_sender(payload, user_id):
                continue

            # 5️⃣ Relay
            await relay_signal(user_id, payload)

    except WebSocketDisconnect:
        handle_disconnect(user_id)
