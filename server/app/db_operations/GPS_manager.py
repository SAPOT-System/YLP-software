import json
import logging
from fastapi import WebSocket
from typing import Dict
from app.structured_logging import log_context

logger = logging.getLogger("app")

class GPSManager:
    def __init__(self):
        # {user_id: websocket} for Rescuers/Admins listening to the feed
        self.active_monitors: Dict[str, WebSocket] = {}

    async def connect_monitor(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_monitors[user_id] = websocket

    def disconnect_monitor(self, user_id: str):
        if user_id in self.active_monitors:
            del self.active_monitors[user_id]

    async def broadcast_to_rescuers(self, message: dict):
        """Send the GPS packet to every connected Rescuer."""
        stale_monitors: list[tuple[str, WebSocket]] = []
        for user_id, connection in list(self.active_monitors.items()):
            try:
                await connection.send_json(message)
            except Exception:
                logger.info(
                    "GPS broadcast delivery failed for disconnected monitor",
                    extra=log_context(user_id, "gps_monitor_disconnected"),
                )
                stale_monitors.append((user_id, connection))
        for user_id, connection in stale_monitors:
            if self.active_monitors.get(user_id) is connection:
                self.disconnect_monitor(user_id)

gps_manager = GPSManager()
