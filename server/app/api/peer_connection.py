from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, WebSocket
from fastapi.responses import HTMLResponse
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.db_operations.token import verify_token
from app.models.signalling import SignalMessage
from fastapi import Query, WebSocketDisconnect
from app.db_operations.websockets import authenticate_websocket, validate_sender, relay_signal, receive_signal_message
from app.db_operations.connection_manager import manager

router = APIRouter(
    prefix='/ws',
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
# ws.send(JSON.stringify(# {
#   type: "offer",
#   from_user: currentUserId,
#   to: targetUserId,
#   data: offer
# }));


html = """
<!DOCTYPE html>
<html>
    <head>
        <title>Chat</title>
    </head>
    <body>
        <h1>WebSocket Chat</h1>
        <h2>Your ID: <span id="ws-id"></span></h2>
        <form action="" onsubmit="sendMessage(event)">
            <input type="text" id="messageText" autocomplete="off" value='  { "type": "offer", "data":  { "sender": "550e8400e29b41d4a716446655440000", "ipAddress": "192.168.254.32", "port": 8000, "to": "619176107fed4af4abb235dc9663136d" } }'/>
            <button>Send</button>
        </form>
        <ul id='messages'>
        </ul>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('my_id');
            const client_id = urlParams.get('target_id');
            var my_id = id
            var token = urlParams.get('token');
            document.querySelector("#ws-id").textContent = my_id;
            var ws = new WebSocket(`ws://localhost:8000/ws/?target_id=${client_id}&token=${token}`);
            ws.onmessage = function(event) {
            console.log("RECEIVED")
                var messages = document.getElementById('messages')
                var message = document.createElement('li')
                var content = document.createTextNode(event.data)
                message.appendChild(content)
                messages.appendChild(message)
            };
            function sendMessage(event) {
                var input = document.getElementById("messageText")
                ws.send(input.value)
                console.log("clicked", input.value)
                input.value = ''
                event.preventDefault()
            }
        </script>
    </body>
</html>
"""


@router.get("/")
async def testing_area(target_id: UUID, my_id: UUID, token: str):
    return HTMLResponse(html)

# TODO add authentication... A CLEAN ONE!!
@router.websocket("/")
async def sdp_relay(target_id: UUID, token: str, websocket: WebSocket):
    """
    will relay the sdp between different users
    can handle
    sdp offer
    sdp answer
    ICE candidates
    handshakes
    """
    user_id = await authenticate_websocket(websocket, token)
    await manager.connect(UUID(user_id), websocket)
    try:
        while True:
            payload = await receive_signal_message(websocket)

            if not payload:
                continue

            if not validate_sender(payload, user_id):
                continue
            print("HERE running")
            await relay_signal(user_id, target_id, payload)
    except WebSocketDisconnect:
        manager.disconnect(user_id)
