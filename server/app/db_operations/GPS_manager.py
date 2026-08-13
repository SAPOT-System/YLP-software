from fastapi import WebSocket
from typing import Dict
from app.db_operations.websocket_auth import WEBSOCKET_AUTH_PROTOCOL


class GPSManager:
    def __init__(self):
        # {user_id: websocket} for Rescuers/Admins listening to the feed
        self.active_monitors: Dict[str, WebSocket] = {}

    async def connect_monitor(self, user_id: str, websocket: WebSocket):
        await websocket.accept(subprotocol=WEBSOCKET_AUTH_PROTOCOL)
        self.active_monitors[user_id] = websocket

    def disconnect_monitor(self, user_id: str):
        if user_id in self.active_monitors:
            del self.active_monitors[user_id]

    async def broadcast_to_rescuers(self, message: dict):
        """Send the GPS packet to every connected Rescuer."""
        for user_id, connection in self.active_monitors.items():
            try:
                await connection.send_json(message)
            except Exception:
                # If a connection is dead, we'll clean it up later or on next fail
                pass

gps_manager = GPSManager()
