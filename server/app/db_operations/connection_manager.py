import asyncio
from uuid import UUID
from fastapi import WebSocket
from typing import Dict


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[UUID, WebSocket] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections[user_id] = websocket

    def disconnect(self, user_id: UUID):
        self.active_connections.pop(user_id, None)

    async def send_personal_message(self, target_id: UUID, message: dict):
        if not isinstance(target_id, UUID):
            target_id = UUID(target_id)
        async with self._lock:
            websocket = self.active_connections.get(target_id)
        if websocket:
            await websocket.send_json(message)

    async def broadcast(self, message: dict):
        async with self._lock:
            targets = list(self.active_connections.items())  # snapshot before iterating

        disconnected_users = []
        for user_id, connection in targets:
            try:
                await connection.send_json(message)
            except Exception as e:
                print("EEEE", e)
                disconnected_users.append(user_id)

        for uid in disconnected_users:
            self.disconnect(uid)

    def get_active_connections(self):
        return [str(x) for x in self.active_connections.keys()]


manager = ConnectionManager()
