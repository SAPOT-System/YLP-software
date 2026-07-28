import asyncio
import json
import logging
import re

import ast
import enum
from typing import Annotated
from uuid import UUID
import json
import ast

from sqlmodel import except_, select, Session
from app.db_operations.auth import SessionDep, engine
from fastapi import APIRouter, Depends, WebSocket
from fastapi.responses import HTMLResponse
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.db_operations.token import verify_token
from app.models.queued import Queue
from app.models.signalling import SignalMessage
from fastapi import Query, WebSocketDisconnect
from app.db_operations.websockets import authenticate_websocket, relay_message, relay_public_message, validate_message_sender, validate_sender, relay_signal, receive_signal_message, WebSocketAuthError
from app.db_operations.connection_manager import manager
from app.db_operations.activity import set_user_status
from app.models.websocketComms import MessageData, PublicMessageData

logger = logging.getLogger(__name__)


def _set_status_bg(user_id: UUID, status: str) -> None:
    try:
        with Session(engine) as session:
            set_user_status(session, user_id, status)
    except Exception as e:
        print(f"[activity] status update failed for {user_id}: {e}")

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


def get_queued_messages(user_id: UUID, session: SessionDep, limit: int = 100):
    try:
        statement = select(Queue).where(Queue.to == user_id).limit(limit)
        return session.exec(statement).all()
    except Exception as e:
        print("EX", e)
        return None


ENUM_PATTERN = re.compile(r"<.*?:\s*'(.+?)'>")

def deep_parse_dict(data):
    if isinstance(data, str):
        data = data.strip()

        # Handle enum-like strings
        enum_match = ENUM_PATTERN.match(data)
        if enum_match:
            return enum_match.group(1)

        # Try JSON
        if (data.startswith('{') and data.endswith('}')) or (data.startswith('[') and data.endswith(']')):
            try:
                data = json.loads(data)
            except Exception:
                try:
                    data = ast.literal_eval(data)
                except Exception:
                    return data
        else:
            return data

    if isinstance(data, dict):
        return {k: deep_parse_dict(v) for k, v in data.items()}

    if isinstance(data, list):
        return [deep_parse_dict(v) for v in data]

    return data


@router.websocket("/")
async def main_web_socket(token: str, websocket: WebSocket, target_id: UUID|None = None):
    """
    will relay the sdp between different users
    can handle
    sdp offer
    sdp answer
    ICE candidates
    handshakes
    """
    try:
        user_id = await authenticate_websocket(websocket, token)
    except WebSocketAuthError:
        logger.warning("WebSocket auth rejected: invalid or expired token")
        return

    await manager.connect(UUID(user_id), websocket)
    asyncio.get_event_loop().run_in_executor(None, _set_status_bg, UUID(user_id), "Active")
    try:
        await manager.broadcast({"type": "status-update", "user_id": user_id, 'status': "online"})
    except:
        pass

    try:
        with Session(engine) as session:
            messages = get_queued_messages(UUID(user_id), session)
            if messages:
                for message in messages:
                    try:
                        parsed = deep_parse_dict(message.data)
                        data = MessageData(
                                type=parsed.get("type"),
                                data=parsed.get("data")
                                )
                        # Acks are ephemeral confirmations — delete and skip rather than
                        # re-queuing them, which would trap them permanently.
                        if data.type == 'ack':
                            session.delete(message)
                            session.commit()
                            continue
                        await relay_message(user_id, user_id, data, session)
                        # don't delete from queue just yet, wait for it to be acknowledged by the receiver
                        if message.payload_type == 'seen':
                            session.delete(message)
                            session.commit()
                    except Exception as e:
                        print(f"[drain] failed to deliver queued message {message.id}: {e}")
    except Exception as e:
        print(f"[drain] failed to fetch queued messages for {user_id}: {e}")

    try:
        while True:
            raw_payload = await receive_signal_message(websocket)

            if not raw_payload:
                continue

            raw_type = raw_payload.type if hasattr(raw_payload, "type") else raw_payload.get("type")
            if raw_type == "public-chat":
                try:
                    payload = PublicMessageData.model_validate(raw_payload)
                except Exception:
                    payload = raw_payload
            else:
                try:
                    payload = MessageData.model_validate(raw_payload)
                except Exception:
                    try:
                        payload = SignalMessage(**raw_payload)
                    except Exception:
                        payload = raw_payload
            if isinstance(payload, dict) and payload.get("type") == "ping":
                await manager.send_personal_message(UUID(user_id), {"type": "pong"})
            # get online users
            elif isinstance(payload, dict) and payload.get("type") == "get-active-users":
                await manager.send_personal_message(UUID(user_id), await manager.get_active_connections())
            # relay public chat data
            elif isinstance(payload, PublicMessageData):                
                with Session(engine) as session:
                    await relay_public_message(user_id, payload, session)
            # relay message data
            elif isinstance(payload, MessageData):
                if payload.data.to is None:
                    continue
                with Session(engine) as session:
                    await relay_message(user_id, UUID(payload.data.to), payload, session)
            elif isinstance(payload, SignalMessage) and validate_sender(payload, user_id):
                if payload.data.to is None:
                    continue
                with Session(engine) as session:
                    await relay_signal(user_id, UUID(payload.data.to), payload, session)

    except WebSocketDisconnect:
        try:
            await manager.broadcast({"type": "status-update","user_id": user_id, 'status': "offline"})
        except:
            pass
        asyncio.get_event_loop().run_in_executor(None, _set_status_bg, UUID(user_id), "Inactive")
        await manager.disconnect(UUID(user_id))
