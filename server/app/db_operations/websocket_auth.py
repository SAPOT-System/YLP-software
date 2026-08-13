from uuid import UUID

from fastapi import WebSocket

from app.db_operations.token import verify_token

WEBSOCKET_AUTH_PROTOCOL = "sapot.jwt"


class WebSocketAuthError(Exception):
    pass


async def authenticate_websocket(websocket: WebSocket) -> UUID:
    protocols = websocket.scope.get("subprotocols", [])

    if (
        "token" in websocket.query_params
        or len(protocols) != 2
        or protocols[0] != WEBSOCKET_AUTH_PROTOCOL
        or not protocols[1]
    ):
        await websocket.close(code=1008)
        raise WebSocketAuthError("Unauthorized")

    try:
        user_id = verify_token(protocols[1])
    except KeyError:
        user_id = None
    if not user_id:
        await websocket.close(code=1008)
        raise WebSocketAuthError("Unauthorized")

    try:
        return UUID(user_id)
    except (TypeError, ValueError):
        await websocket.close(code=1008)
        raise WebSocketAuthError("Unauthorized") from None
