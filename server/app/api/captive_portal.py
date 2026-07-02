"""
SAPOT Captive Portal — FastAPI Backend
======================================
Handles guest session logging from the MikroTik hotspot portal.

Endpoints
---------
POST  /api/v1/guests                        — record a new guest login
PATCH /api/v1/guests/{session_id}/disconnect — mark session as ended
GET   /api/v1/guests                        — list all guests (filterable)
GET   /api/v1/guests/{session_id}           — retrieve a single session
GET   /api/v1/guests/stats                  — aggregate stats (count, active)

Run
---
    pip install fastapi uvicorn sqlmodel
    uvicorn main:app --host 0.0.0.0 --port 80 --reload
"""


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Field, Session, SQLModel, create_engine, select, func, col



from fastapi import APIRouter

from app.models.captive_portal import GuestSessionRead, GuestLoginRequest, GuestSession, StatsResponse, SessionStatus, GuestListResponse
from app.db_operations.auth import SessionDep


router = APIRouter(
    prefix='/portal',
    tags=['captive portal'],
    responses={
        404: {'description': 'Not Found'}
    }
)

# CORS — allow requests from MikroTik hotspot pages (same LAN)
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],          # Tighten to hotspot subnet IP/hostname in production
#     allow_credentials=False,
#     allow_methods=["GET", "POST", "PATCH"],
#     allow_headers=["Content-Type"],
# )
#

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post(
    "/api/v1/guests",
    response_model=GuestSessionRead,
    status_code=201,
    summary="Record a new guest login",
)
def create_guest_session(
    payload: GuestLoginRequest,
    session: SessionDep
):
    """
    Called by `login.html` immediately after the user submits their name.

    - Creates a new `GuestSession` row with `status=active`.
    - If the same `session_id` is sent twice (e.g. double-submit), returns the
      existing record with HTTP 200 instead of raising a 409.
    """
    # Idempotency: return existing record if session_id already exists
    existing = session.exec(
        select(GuestSession).where(GuestSession.session_id == payload.session_id)
    ).first()
    if existing:
        return existing

    guest = GuestSession.model_validate(payload)
    session.add(guest)
    session.commit()
    session.refresh(guest)
    return guest


@router.patch(
    "/api/v1/guests/{session_id}/disconnect",
    response_model=GuestSessionRead,
    summary="Mark a session as disconnected",
)
def disconnect_guest_session(
    session_id: str,
    session: SessionDep
):
    """
    Called by `logout.html` when the user clicks Disconnect.
    Sets `status=disconnected` and records `disconnect_at`.
    Safe to call multiple times (idempotent).
    """
    guest = db.exec(
        select(GuestSession).where(GuestSession.session_id == session_id)
    ).first()

    if not guest:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if guest.status == SessionStatus.disconnected:
        return guest  # already closed — nothing to do

    guest.status = SessionStatus.disconnected
    guest.disconnect_at = datetime.now(timezone.utc)
    db.add(guest)
    db.commit()
    db.refresh(guest)
    return guest


@router.get(
    "/api/v1/guests/stats",
    response_model=StatsResponse,
    summary="Aggregate session statistics",
)
def get_stats(
    session: SessionDep
              ):
    """
    Returns total, active, and disconnected session counts.
    Useful for a future SAPOT admin dashboard.
    """
    total = session.exec(select(func.count(col(GuestSession.id)))).one()
    active = session.exec(
        select(func.count(col(GuestSession.id))).where(
            GuestSession.status == SessionStatus.active
        )
    ).one()
    return StatsResponse(
        total_sessions=total,
        active_sessions=active,
        disconnected_sessions=total - active,
    )


@router.get(
    "/api/v1/guests",
    response_model=GuestListResponse,
    summary="List all guest sessions",
)
def list_guests(
    session: SessionDep,
    status: Optional[SessionStatus] = Query(default=None, description="Filter by status: active | disconnected"),
    search: Optional[str] = Query(default=None, description="Search by first or last name (case-insensitive)"),
    limit: int = Query(default=50, le=500, description="Max results per page"),
    offset: int = Query(default=0, ge=0, description="Pagination offset"),

):
    """
    Retrieve all recorded guest sessions.

    **Query parameters**
    - `status=active` — only currently connected guests
    - `status=disconnected` — only past sessions
    - `search=Juan` — partial match on first or last name
    - `limit` / `offset` — standard pagination
    """
    query = select(GuestSession)

    if status:
        query = query.where(GuestSession.status == status)

    if search:
        term = f"%{search.lower()}%"
        query = query.where(
            col(GuestSession.first_name).ilike(term) |
            col(GuestSession.last_name).ilike(term)
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = session.exec(count_query).one()

    results = session.exec(
        query.order_by(GuestSession.login_at.desc()).offset(offset).limit(limit)
    ).all()

    return GuestListResponse(total=total, results=results)


@router.get(
    "/api/v1/guests/{session_id}",
    response_model=GuestSessionRead,
    summary="Retrieve a single guest session",
)
def get_guest_session(
    session: SessionDep,
    session_id: str,
):
    """Fetch one session by its client-generated `session_id`."""
    guest = session.exec(
        select(GuestSession).where(GuestSession.session_id == session_id)
    ).first()
    if not guest:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    return guest
