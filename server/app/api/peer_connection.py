import asyncio
import logging
import re
import ast
import json
from uuid import UUID

from sqlmodel import select, Session
from app.db_operations.auth import SessionDep, engine
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.models.queued import Queue
from app.models.signalling import SignalMessage
from app.db_operations.websocket_auth import WebSocketAuthError, authenticate_websocket
from app.db_operations.websockets import (
    receive_signal_message,
    relay_message,
    relay_public_message,
    relay_signal,
    validate_sender,
)
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
async def main_web_socket(websocket: WebSocket, target_id: UUID|None = None):
    """
    will relay the sdp between different users
    can handle
    sdp offer
    sdp answer
    ICE candidates
    handshakes
    """
    try:
        user_id = await authenticate_websocket(websocket)
    except WebSocketAuthError:
        logger.warning("WebSocket auth rejected: invalid or expired token client=%s", websocket.client)
        return

    await manager.connect(user_id, websocket)
    asyncio.get_event_loop().run_in_executor(None, _set_status_bg, user_id, "Active")
    try:
        await manager.broadcast({"type": "status-update", "user_id": user_id, 'status': "online"})
    except:
        pass

    try:
        with Session(engine) as session:
            messages = get_queued_messages(user_id, session)
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
                await manager.send_personal_message(user_id, {"type": "pong"})
            # get online users
            elif isinstance(payload, dict) and payload.get("type") == "get-active-users":
                await manager.send_personal_message(user_id, await manager.get_active_connections())
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
        asyncio.get_event_loop().run_in_executor(None, _set_status_bg, user_id, "Inactive")
        await manager.disconnect(user_id)
