import asyncio
import json
import logging
import time
from uuid import UUID, uuid4
from fastapi import WebSocket
from typing import Dict, Optional

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

_PRESENCE_KEY = "ws:online_users"       # Sorted set; score = expiry epoch (float)
_BROADCAST_CHANNEL = "ws:broadcast"
_PRESENCE_TTL = 90.0                    # seconds before a stale entry expires
_HEARTBEAT_INTERVAL = 30.0             # seconds between score refreshes


def _user_channel(user_id: UUID) -> str:
    return f"ws:user:{user_id}"


class ConnectionManager:
    def __init__(self) -> None:
        self._local: Dict[UUID, WebSocket] = {}
        self._sub_tasks: Dict[UUID, asyncio.Task] = {}
        self._hb_tasks: Dict[UUID, asyncio.Task] = {}
        self._redis: Optional[aioredis.Redis] = None
        self._broadcast_task: Optional[asyncio.Task] = None
        # Unique per-worker ID used to suppress loopback on broadcast.
        self._worker_id: str = str(uuid4())

    # ------------------------------------------------------------------
    # Lifecycle — called from FastAPI lifespan
    # ------------------------------------------------------------------

    async def init(self, redis_client: aioredis.Redis) -> None:
        self._redis = redis_client
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(_BROADCAST_CHANNEL)
        self._broadcast_task = asyncio.create_task(
            self._broadcast_loop(pubsub), name="ws-broadcast-sub"
        )

    async def shutdown(self) -> None:
        if self._broadcast_task:
            self._broadcast_task.cancel()
            try:
                await self._broadcast_task
            except asyncio.CancelledError:
                pass
        for task in list(self._sub_tasks.values()):
            task.cancel()
        for task in list(self._hb_tasks.values()):
            task.cancel()
        if self._redis:
            await self._redis.aclose()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._local[user_id] = websocket
        await self._set_presence(user_id)
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(_user_channel(user_id))
        self._sub_tasks[user_id] = asyncio.create_task(
            self._user_sub_loop(user_id, websocket, pubsub),
            name=f"ws-sub-{user_id}",
        )
        self._hb_tasks[user_id] = asyncio.create_task(
            self._heartbeat_loop(user_id), name=f"ws-hb-{user_id}"
        )

    async def disconnect(self, user_id: UUID) -> None:
        self._local.pop(user_id, None)
        for tasks in (self._sub_tasks, self._hb_tasks):
            task = tasks.pop(user_id, None)
            if task:
                task.cancel()
        if self._redis:
            await self._redis.zrem(_PRESENCE_KEY, str(user_id))

    async def send_personal_message(self, target_id: UUID, message: dict) -> None:
        if not isinstance(target_id, UUID):
            target_id = UUID(str(target_id))
        # Fast path: socket lives in this worker
        ws = self._local.get(target_id)
        if ws:
            try:
                await ws.send_json(message)
                return
            except Exception:
                await self.disconnect(target_id)
        # Cross-worker: publish so the holding worker delivers it
        if self._redis:
            await self._redis.publish(
                _user_channel(target_id), json.dumps(message)
            )

    async def broadcast(self, message: dict) -> None:
        if self._redis:
            envelope = {"_wid": self._worker_id, "msg": message}
            await self._redis.publish(_BROADCAST_CHANNEL, json.dumps(envelope))

    async def is_user_connected(self, user_id: UUID) -> bool:
        if not isinstance(user_id, UUID):
            user_id = UUID(str(user_id))
        if user_id in self._local:
            return True
        if not self._redis:
            return False
        score = await self._redis.zscore(_PRESENCE_KEY, str(user_id))
        return score is not None and score >= time.time()

    async def get_active_connections(self) -> list[str]:
        if not self._redis:
            return [str(uid) for uid in self._local]
        now = time.time()
        members = await self._redis.zrangebyscore(_PRESENCE_KEY, now, "+inf")
        return list(members)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _set_presence(self, user_id: UUID) -> None:
        await self._redis.zadd(
            _PRESENCE_KEY, {str(user_id): time.time() + _PRESENCE_TTL}
        )

    async def _heartbeat_loop(self, user_id: UUID) -> None:
        try:
            while user_id in self._local:
                await asyncio.sleep(_HEARTBEAT_INTERVAL)
                if user_id in self._local and self._redis:
                    await self._set_presence(user_id)
        except asyncio.CancelledError:
            pass

    async def _user_sub_loop(
        self, user_id: UUID, websocket: WebSocket, pubsub: aioredis.client.PubSub
    ) -> None:
        try:
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                try:
                    data = json.loads(raw["data"])
                    await websocket.send_json(data)
                except Exception as exc:
                    logger.debug("[ws-sub] delivery failed user=%s: %s", user_id, exc)
                    break
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(_user_channel(user_id))
            await pubsub.aclose()

    async def _broadcast_loop(self, pubsub: aioredis.client.PubSub) -> None:
        try:
            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                try:
                    envelope = json.loads(raw["data"])
                    if envelope.get("_wid") == self._worker_id:
                        continue
                    message = envelope["msg"]
                except Exception:
                    continue
                stale: list[UUID] = []
                for uid, ws in list(self._local.items()):
                    try:
                        await ws.send_json(message)
                    except Exception:
                        stale.append(uid)
                for uid in stale:
                    await self.disconnect(uid)
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(_BROADCAST_CHANNEL)
            await pubsub.aclose()


manager = ConnectionManager()
