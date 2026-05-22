from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Field, Session, SQLModel, create_engine, select, func, col


class SessionStatus(str, Enum):
    active = "active"
    disconnected = "disconnected"


class GuestSessionBase(SQLModel):
    """Fields shared between DB model and API schemas."""
    session_id: str = Field(index=True, unique=True, description="Client-generated session ID (sess_<timestamp>_<random>)")
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    mac_address: Optional[str] = Field(default=None, max_length=17, description="Client MAC address (from MikroTik $(mac))")
    ip_address: Optional[str] = Field(default=None, max_length=45, description="Client IP address (from MikroTik $(ip))")
    hotspot_name: Optional[str] = Field(default=None, max_length=100, description="MikroTik hotspot hostname")


class GuestSession(GuestSessionBase, table=True):
    """SQLModel table — persisted to DB."""
    __tablename__ = "guest_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    status: SessionStatus = Field(default=SessionStatus.active)
    login_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    disconnect_at: Optional[datetime] = Field(default=None)


# ---------------------------------------------------------------------------
# Request / Response schemas (no table=True → pure Pydantic)
# ---------------------------------------------------------------------------

class GuestLoginRequest(GuestSessionBase):
    """Body accepted by POST /api/v1/guests."""
    pass


class GuestSessionRead(GuestSessionBase):
    """Full session object returned to clients."""
    id: int
    status: SessionStatus
    login_at: datetime
    disconnect_at: Optional[datetime]

    class Config:
        from_attributes = True


class GuestListResponse(SQLModel):
    total: int
    results: List[GuestSessionRead]


class StatsResponse(SQLModel):
    total_sessions: int
    active_sessions: int
    disconnected_sessions: int

