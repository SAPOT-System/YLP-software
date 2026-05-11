"""
sapot/session_manager.py
────────────────────────
Tracks conversation state for each phone number that texts the server.

Each number gets its own Session that records:
  - which stage of the flow they're in
  - their currently set target recipient
"""

from dataclasses import dataclass, field
from typing import Optional, Dict
from enum import Enum, auto
import time


class Stage(Enum):
    """Conversation stages for an SMS user."""
    NEW           = auto()   # Never texted before or session expired
    AWAITING_TARGET = auto() # Server asked for [target] number
    ACTIVE        = auto()   # Target is set; forwarding messages


@dataclass
class Session:
    number: str
    stage: Stage = Stage.NEW
    target: Optional[str] = None          # Current target phone number
    target_username: Optional[str] = None # Display name of target (from DB)
    last_seen: float = field(default_factory=time.time)

    def touch(self):
        self.last_seen = time.time()

    def reset(self):
        self.stage  = Stage.NEW
        self.target = None
        self.target_username = None


class SessionManager:
    """
    In-memory session store.
    Sessions expire after `ttl_seconds` of inactivity (default 30 min).

    Replace the internal dict with a DB-backed store when moving to FastAPI.
    """

    SESSION_TTL = 30 * 60  # seconds

    def __init__(self):
        self._sessions: Dict[str, Session] = {}

    def get(self, number: str) -> Session:
        """Return the session for `number`, creating one if absent."""
        self._expire_old()
        if number not in self._sessions:
            self._sessions[number] = Session(number=number)
        session = self._sessions[number]
        session.touch()
        return session

    def _expire_old(self):
        now = time.time()
        expired = [n for n, s in self._sessions.items()
                   if now - s.last_seen > self.SESSION_TTL]
        for n in expired:
            del self._sessions[n]

    def all_sessions(self) -> Dict[str, Session]:
        return dict(self._sessions)
