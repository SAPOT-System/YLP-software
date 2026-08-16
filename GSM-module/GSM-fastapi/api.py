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
import hmac
import logging
import re
from contextlib import asynccontextmanager
from typing import Annotated, Counter, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

import database
from app_version import __version__
from serial_worker import (
    OutboundQueueFullError,
    SerialWorker,
    WorkerStoppingError,
)
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
    orphaned_count = database.fail_orphaned_pending_messages()
    if orphaned_count:
        logger.warning(
            "Marked %d orphaned SMS messages as failed after service restart",
            orphaned_count,
        )

    # Serial worker
    _worker = SerialWorker(
        settings.serial_port,
        settings.serial_baud,
        settings.sms_send_queue_maxsize,
    )
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

    reply, forward_number, forward_body, rejection_reason = handle_incoming_sms(
        number, body
    )

    if rejection_reason:
        database.update_message_status(msg_id, "rejected", rejection_reason)

    # Forward to target via SMS
    if forward_number and forward_body and _worker:
        _send_and_log(
            from_number="SERVER",
            to_number=forward_number,
            body=forward_body,
        )


    # Send reply back to sender
    if reply and _worker:
        reply_sent = _send_and_log(
            from_number="SERVER",
            to_number=number,
            body=reply,
        )
        if reply_sent and rejection_reason == "NO_ACCOUNT":
            database.mark_unregistered_warning(number)



def _send_and_log(from_number: str, to_number: str, body: str):
    """Send one SMS, persist its result, and return whether it was sent."""
    msg_id = database.log_message(
        direction="OUT",
        from_number=from_number,
        to_number=to_number,
        body=body,
        status="pending",
    )
    try:
        result = _worker.send_sms(to_number, body, timeout=120)
        status = "sent" if result["ok"] else "failed"
        database.update_message_status(msg_id, status, result.get("reason"))
        return result["ok"]
    except OutboundQueueFullError:
        logger.warning("Internal outbound SMS rejected: QUEUE_FULL")
        database.update_message_status(msg_id, "failed", "QUEUE_FULL")
    except WorkerStoppingError:
        logger.info("Internal outbound SMS rejected: SERVICE_STOPPING")
        database.update_message_status(msg_id, "failed", "SERVICE_STOPPING")
    except Exception as e:
        logger.error("send_sms error: %s", e)
        database.update_message_status(msg_id, "failed", str(e))

    return False


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="SAPOT SMS Relay API",
    version=__version__,
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


def require_gsm_secret(
    x_gsm_secret: Annotated[
        Optional[str], Header(alias="X-GSM-Secret")
    ] = None,
):
    if x_gsm_secret is None or not hmac.compare_digest(
        x_gsm_secret, settings.gsm_secret
    ):
        raise HTTPException(status_code=401, detail="Invalid GSM secret")


# ── Health endpoints ──────────────────────────────────────────────────────────

@app.get("/health", tags=["health"])
async def health():
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
def health_detailed(
    phone: Optional[str] = None,
        ):
    """Full diagnostic — serial state, queue depth, pending SMS."""
    if _worker is None:
        raise HTTPException(503, "Worker not initialised")

    response = database.get_messages(limit=10_000, phone=phone)

    messages = response["messages"]  # Extract the list
    total = response["total"]  # Use total from response

    direction_counts = Counter(m["direction"] for m in messages)
    status_counts = Counter(m["status"] for m in messages)
    failure_counts = Counter(
        m["failure_reason"] for m in messages if m["failure_reason"]
    )

    def pct(value):
        return round((value / total) * 100, 2) if total else 0

    return {
        "gsm_ready":    _worker.gsm_ready,
        "connected":    _worker.connected,
        "last_status":  _worker.last_status,
        "queue_depth":  _worker.incoming_queue.qsize(),
        "outbound_queue_depth": _worker.outbound_queue_depth,
        "outbound_queue_capacity": _worker.outbound_queue_capacity,
        "outbound_in_flight": _worker.outbound_in_flight,
        "port":         settings.serial_port,
        "baud":         settings.serial_baud,
        "total_messages": total,

        "direction": {
            k: {
                "count": v,
                "percent": pct(v)
            }
            for k, v in direction_counts.items()
        },

        "status": {
            k: {
                "count": v,
                "percent": pct(v)
            }
            for k, v in status_counts.items()
        },

        "failure_reasons": {
            k: {
                "count": v,
                "percent": pct(v)
            }
            for k, v in failure_counts.items()
        }
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

@app.post(
    "/sms/send",
    tags=["sms"],
    dependencies=[Depends(require_gsm_secret)],
)
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
        result = _worker.send_sms(req.number, req.body, timeout=60)
    except OutboundQueueFullError:
        database.update_message_status(msg_id, "failed", "QUEUE_FULL")
        raise HTTPException(503, {
            "message": "Outbound SMS queue is full",
            "reason": "QUEUE_FULL",
            "msg_id": msg_id,
        })
    except WorkerStoppingError:
        database.update_message_status(msg_id, "failed", "SERVICE_STOPPING")
        raise HTTPException(503, {
            "message": "SMS service is stopping",
            "reason": "SERVICE_STOPPING",
            "msg_id": msg_id,
        })
    except RuntimeError as e:
        database.update_message_status(msg_id, "failed", str(e))
        raise HTTPException(503, str(e))

    status = "sent" if result["ok"] else "failed"
    database.update_message_status(msg_id, status, result.get("reason"))

    if not result["ok"]:
        if result["reason"] == "SERVICE_STOPPING":
            raise HTTPException(503, {
                "message": "SMS service is stopping",
                "reason": "SERVICE_STOPPING",
                "msg_id": msg_id,
            })
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
