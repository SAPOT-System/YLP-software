from uuid import UUID
from fastapi import WebSocket
from typing import Dict

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[UUID, WebSocket] = {}

    async def connect(self, user_id: UUID, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: UUID):
        self.active_connections.pop(user_id, None)


    async def send_personal_message(self, target_id: UUID, message: dict):
        websocket = self.active_connections.get(target_id)
        if websocket:
            await websocket.send_json(message)

    async def broadcast(self, message: str):
        for _, connection in self.active_connections.items():
            await connection.send_json(message)


manager = ConnectionManager()
