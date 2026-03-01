from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, WebSocket
from fastapi.responses import HTMLResponse
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.db_operations.token import verify_token
from app.models.signalling import SignalMessage
from fastapi import Query, WebSocketDisconnect
from app.db_operations.websockets import authenticate_websocket, validate_sender, relay_signal, handle_disconnect, receive_signal_message

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
# ws.send(JSON.stringify({
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
            <input type="text" id="messageText" autocomplete="off"/>
            <button>Send</button>
        </form>
        <ul id='messages'>
        </ul>
        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const id = urlParams.get('my_id');
            const client_id = urlParams.get('target_id');
            var my_id = id
            document.querySelector("#ws-id").textContent = my_id;
            var ws = new WebSocket(`ws://localhost:8000/ws/?target_id=${client_id}&my_id=${my_id}`);
            ws.onmessage = function(event) {
                var messages = document.getElementById('messages')
                var message = document.createElement('li')
                var content = document.createTextNode(event.data)
                message.appendChild(content)
                messages.appendChild(message)
            };
            function sendMessage(event) {
                var input = document.getElementById("messageText")
                ws.send(input.value)
                input.value = ''
                event.preventDefault()
            }
        </script>
    </body>
</html>
"""


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[UUID, WebSocket] = {}

    async def connect(self, identifier: UUID, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[identifier] = websocket

    def disconnect(self, identifier: UUID):
        self.active_connections.pop(identifier)

    async def send_personal_message(self, identifier: UUID, message: str):
        websocket = self.active_connections.get(identifier)
        if not websocket:
            raise Exception("active connection!")
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        for identifier, connection in self.active_connections.items():
            await connection.send_text(message)


manager = ConnectionManager()


@router.get("/")
async def get(target_id: UUID, my_id: UUID):
    return HTMLResponse(html)


@router.websocket("/")
async def websocket_endpoint(target_id: UUID, my_id: UUID, websocket: WebSocket):
    await manager.connect(my_id, websocket)
    target_conn = manager.active_connections.get(target_id)
    if target_conn:
        await target_conn.send_text(f"Client #{target_id} joined the chat")
    try:
        while True:
            data = await websocket.receive_text()

            receiver_id = target_id
            message = data

            if receiver_id in manager.active_connections:
                await manager.send_personal_message(receiver_id, message)
            else:
                print("Receiver not connected")

    except WebSocketDisconnect:
        manager.disconnect(my_id)
        await manager.active_connections.get(target_id).send_text(f"Client #{target_id} left the chat")
