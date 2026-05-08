"""
api.py
──────
FastAPI application for the SAPOT SMS relay.

Lifespan
  - Initialises database
  - Starts serial worker thread
  - Starts inbox-drain background task (processes incoming SMS queue)
  - Shuts everything down cleanly on exit

Endpoints
  GET  /health                 — liveness + GSM status
  GET  /health/detailed        — full diagnostic info

  POST /sms/send               — send an SMS (blocks until delivered)
  GET  /sms/messages           — message log

  GET  /users                  — list registered SAPOT users
  POST /users                  — add a user
  GET  /users/{phone}          — look up a user

  GET  /sessions               — all active sessions (debug)
  DELETE /sessions/{phone}     — reset a session

  GET  /status                 — modem + serial status
"""

import asyncio
import logging
import re
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

import database
from serial_worker import SerialWorker
from sms_handler import handle_incoming_sms
from config import settings

logger = logging.getLogger("sapot.api")

# ── Global worker instance (set during lifespan) ──────────────────────────────
_worker: Optional[SerialWorker] = None


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker

    # Database
    database.init(settings.db_path)
    logger.info("Database ready")

    # Serial worker
    _worker = SerialWorker(settings.serial_port, settings.serial_baud)
    _worker.start()
    logger.info("Serial worker started on %s", settings.serial_port)

    # Background inbox drain task
    task = asyncio.create_task(_inbox_drain())

    yield  # ← application runs here

    # Shutdown
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    _worker.stop()
    logger.info("Shutdown complete")


async def _inbox_drain():
    """
    Continuously drain the incoming SMS queue and process each message.
    Runs as an asyncio task; offloads blocking work to a thread pool.
    """
    loop = asyncio.get_running_loop()
    while True:
        try:
            # Non-blocking check; if empty, yield control for 100 ms
            try:
                event = _worker.incoming_queue.get_nowait()
            except Exception:
                await asyncio.sleep(0.1)
                continue

            await loop.run_in_executor(None, _process_incoming, event)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Inbox drain error: %s", e)
            await asyncio.sleep(1)


def _process_incoming(event):
    """
    Handle one incoming SMS event (runs in thread-pool executor).
    Logs to DB, runs business logic, sends reply + forward via worker.
    """
    number = event.number
    body   = event.body

    # Log the inbound message
    msg_id = database.log_message(
        direction="IN",
        from_number=number,
        to_number="SERVER",
        body=body,
        status="received",
    )

    reply, forward_number, forward_body = handle_incoming_sms(number, body)

    # Send reply back to sender
    if reply and _worker:
        _send_and_log(
            from_number="SERVER",
            to_number=number,
            body=reply,
        )

    # Forward to target via SMS
    if forward_number and forward_body and _worker:
        _send_and_log(
            from_number="SERVER",
            to_number=forward_number,
            body=forward_body,
        )


def _send_and_log(from_number: str, to_number: str, body: str):
    """Send one SMS via the worker and persist result to DB."""
    msg_id = database.log_message(
        direction="OUT",
        from_number=from_number,
        to_number=to_number,
        body=body,
        status="pending",
    )
    try:
        result = _worker.send_sms(to_number, body, timeout=30)
        status = "sent" if result["ok"] else "failed"
        database.update_message_status(msg_id, status, result.get("reason"))
    except Exception as e:
        logger.error("send_sms error: %s", e)
        database.update_message_status(msg_id, "failed", str(e))


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SAPOT SMS Relay API",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Pydantic models ───────────────────────────────────────────────────────────

class SendSMSRequest(BaseModel):
    number: str
    body:   str

    @field_validator("number")
    @classmethod
    def validate_number(cls, v):
        if not re.match(r"^\+\d{7,15}$", v):
            raise ValueError("number must be E.164 format e.g. +639171234567")
        return v

    @field_validator("body")
    @classmethod
    def validate_body(cls, v):
        if not v.strip():
            raise ValueError("body cannot be empty")
        if len(v) > 160:
            raise ValueError("body exceeds 160 characters")
        return v.strip()


class AddUserRequest(BaseModel):
    phone:      str
    username:   str
    app_active: bool = True

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v):
        if not re.match(r"^\+\d{7,15}$", v):
            raise ValueError("phone must be E.164 format")
        return v


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
def health():
    """
    Liveness check. Returns 200 if the API is running.
    Returns 503 if the GSM modem is not ready (so load balancers can react).
    """
    if _worker is None:
        return JSONResponse(status_code=503, content={
            "status": "starting",
            "gsm_ready": False,
            "connected": False,
        })

    ok = _worker.gsm_ready
    return JSONResponse(
        status_code=200 if ok else 503,
        content={
            "status":    "ok" if ok else "degraded",
            "gsm_ready": _worker.gsm_ready,
            "connected": _worker.connected,
            "detail":    _worker.last_status,
        },
    )


@app.get("/health/detailed", tags=["health"])
def health_detailed():
    """Full diagnostic — serial state, queue depth, pending SMS."""
    if _worker is None:
        raise HTTPException(503, "Worker not initialised")
    return {
        "gsm_ready":    _worker.gsm_ready,
        "connected":    _worker.connected,
        "last_status":  _worker.last_status,
        "queue_depth":  _worker.incoming_queue.qsize(),
        "port":         settings.serial_port,
        "baud":         settings.serial_baud,
        "db_path":      settings.db_path,
    }


# ── Status ────────────────────────────────────────────────────────────────────

@app.get("/status", tags=["modem"])
def status():
    """Modem and serial connection status."""
    if _worker is None:
        raise HTTPException(503, "Worker not initialised")
    return {
        "connected":   _worker.connected,
        "gsm_ready":   _worker.gsm_ready,
        "last_status": _worker.last_status,
    }


# ── SMS endpoints ─────────────────────────────────────────────────────────────

@app.post("/sms/send", tags=["sms"])
def send_sms(req: SendSMSRequest):
    """
    Send an SMS directly. Blocks until the modem confirms delivery.
    Use this endpoint when your main SAPOT API wants to send an SMS
    without going through the conversation relay flow.
    """
    if _worker is None or not _worker.gsm_ready:
        raise HTTPException(503, "GSM modem not ready")

    msg_id = database.log_message(
        direction="OUT",
        from_number="API",
        to_number=req.number,
        body=req.body,
        status="pending",
    )

    try:
        result = _worker.send_sms(req.number, req.body, timeout=30)
    except RuntimeError as e:
        database.update_message_status(msg_id, "failed", str(e))
        raise HTTPException(503, str(e))

    status = "sent" if result["ok"] else "failed"
    database.update_message_status(msg_id, status, result.get("reason"))

    if not result["ok"]:
        raise HTTPException(502, {
            "message": "SMS delivery failed",
            "reason":  result["reason"],
            "msg_id":  msg_id,
        })

    return {
        "ok":     True,
        "msg_id": msg_id,
        "to":     req.number,
    }


@app.get("/sms/messages", tags=["sms"])
def list_messages(
    limit:     int           = Query(50, ge=1, le=500),
    direction: Optional[str] = Query(None, pattern="^(IN|OUT)$"),
    phone:     Optional[str] = None,
):
    """Return message log, newest first."""
    return database.get_messages(limit=limit, direction=direction, phone=phone)


# ── User endpoints ────────────────────────────────────────────────────────────

@app.get("/users", tags=["users"])
def list_users():
    return database.get_all_users()


@app.get("/users/{phone}", tags=["users"])
def get_user(phone: str):
    user = database.lookup_number(phone)
    if not user:
        raise HTTPException(404, f"No user with phone {phone}")
    return user


@app.post("/users", tags=["users"], status_code=201)
def add_user(req: AddUserRequest):
    try:
        return database.add_user(req.phone, req.username, req.app_active)
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, f"Phone {req.phone} already registered")
        raise HTTPException(500, str(e))


# ── Session endpoints ─────────────────────────────────────────────────────────

@app.get("/sessions", tags=["sessions"])
def list_sessions():
    """All sessions currently in the database (for debugging)."""
    with database._conn() as cx:
        rows = cx.execute("SELECT * FROM sessions ORDER BY last_seen DESC").fetchall()
    return [dict(r) for r in rows]


@app.delete("/sessions/{phone}", tags=["sessions"])
def reset_session(phone: str):
    """Reset a user's conversation session back to NEW."""
    database.reset_session(phone)
    return {"ok": True, "phone": phone}
