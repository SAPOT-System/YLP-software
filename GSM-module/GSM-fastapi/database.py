"""
database.py
───────────
SQLite-backed persistence for SAPOT SMS relay.

Schema
──────
  users        — registered SAPOT accounts (phone + username)
  sessions     — per-number conversation state (stage + current target)
  messages     — log of every SMS in/out

Seed data is inserted on first run so the system works out of the box.
Replace seed numbers with real ones when connecting to the SAPOT backend.
"""

import sqlite3
import threading
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

logger = logging.getLogger("sapot.db")

# Thread-local connections so each thread gets its own sqlite3 connection
# (sqlite3 objects must not be shared across threads by default)
_local = threading.local()
_DB_PATH = "sapot.db"


def init(db_path: str = "sapot.db"):
    """Create tables and seed mock users. Call once at startup."""
    global _DB_PATH
    _DB_PATH = db_path
    with _conn() as cx:
        _create_schema(cx)
        _seed(cx)
    logger.info("Database initialised at %s", db_path)


@contextmanager
def _conn():
    """Yield a connection for the current thread, auto-committing on exit."""
    if not hasattr(_local, "cx") or _local.cx is None:
        _local.cx = sqlite3.connect(_DB_PATH, check_same_thread=False)
        _local.cx.row_factory = sqlite3.Row
        _local.cx.execute("PRAGMA journal_mode=WAL")
        _local.cx.execute("PRAGMA foreign_keys=ON")
    try:
        yield _local.cx
        _local.cx.commit()
    except Exception:
        _local.cx.rollback()
        raise


# ── Schema ────────────────────────────────────────────────────────────────────

def _create_schema(cx: sqlite3.Connection):
    cx.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        phone       TEXT    NOT NULL UNIQUE,   -- E.164  e.g. +639171234567
        username    TEXT    NOT NULL,
        app_active  INTEGER NOT NULL DEFAULT 1, -- 1 = has SAPOT app account
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
        phone           TEXT PRIMARY KEY,
        stage           TEXT NOT NULL DEFAULT 'NEW',
        target_phone    TEXT,
        target_username TEXT,
        last_seen       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        direction     TEXT NOT NULL,  -- 'IN' or 'OUT'
        from_number   TEXT NOT NULL,
        to_number     TEXT NOT NULL,
        body          TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        -- 'pending' | 'sent' | 'failed' | 'received'
        failure_reason TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """)


def _seed(cx: sqlite3.Connection):
    """Insert mock users if the table is empty."""
    row = cx.execute("SELECT COUNT(*) FROM users").fetchone()
    if row[0] > 0:
        return

    mock_users = [
        ("+639171234567", "juan_dela_cruz",  1),
        ("+639281234567", "maria_santos",    1),
        ("+639991234567", "pedro_reyes",     1),
        ("+639501234567", "ana_garcia",      0),  # no app account
        ("+639165635674", "emman",      1),  # no app account
        ("+639619881837", "smartemman",      1),  # no app account
    ]
    cx.executemany(
        "INSERT INTO users (phone, username, app_active) VALUES (?,?,?)",
        mock_users,
    )
    logger.info("Seeded %d mock users", len(mock_users))


# ── User lookups ──────────────────────────────────────────────────────────────

def lookup_number(phone: str) -> Optional[dict]:
    """Return user dict or None if not registered."""
    with _conn() as cx:
        row = cx.execute(
            "SELECT phone, username, app_active FROM users WHERE phone = ?",
            (phone,)
        ).fetchone()
    return dict(row) if row else None


def get_all_users() -> list[dict]:
    with _conn() as cx:
        rows = cx.execute(
            "SELECT id, phone, username, app_active, created_at FROM users"
            " ORDER BY id"
        ).fetchall()
    return [dict(r) for r in rows]


def add_user(phone: str, username: str, app_active: bool = True) -> dict:
    with _conn() as cx:
        cx.execute(
            "INSERT INTO users (phone, username, app_active) VALUES (?,?,?)",
            (phone, username, int(app_active)),
        )
        row = cx.execute(
            "SELECT id, phone, username, app_active, created_at"
            " FROM users WHERE phone = ?", (phone,)
        ).fetchone()
    return dict(row)


# ── Session management ────────────────────────────────────────────────────────

def get_session(phone: str) -> dict:
    """Return session row, creating it if absent."""
    with _conn() as cx:
        row = cx.execute(
            "SELECT * FROM sessions WHERE phone = ?", (phone,)
        ).fetchone()
        if row is None:
            cx.execute(
                "INSERT INTO sessions (phone, stage) VALUES (?, 'NEW')",
                (phone,)
            )
            row = cx.execute(
                "SELECT * FROM sessions WHERE phone = ?", (phone,)
            ).fetchone()
        # Touch last_seen
        cx.execute(
            "UPDATE sessions SET last_seen = datetime('now') WHERE phone = ?",
            (phone,)
        )
    return dict(row)


def update_session(phone: str, **kwargs):
    """Update any subset of session fields."""
    allowed = {"stage", "target_phone", "target_username"}
    fields  = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values     = list(fields.values()) + [phone]
    with _conn() as cx:
        cx.execute(
            f"UPDATE sessions SET {set_clause},"
            f" last_seen = datetime('now') WHERE phone = ?",
            values,
        )


def reset_session(phone: str):
    with _conn() as cx:
        cx.execute(
            "UPDATE sessions SET stage='NEW', target_phone=NULL,"
            " target_username=NULL, last_seen=datetime('now')"
            " WHERE phone = ?",
            (phone,)
        )


# ── Message log ───────────────────────────────────────────────────────────────

def log_message(direction: str, from_number: str, to_number: str,
                body: str, status: str = "pending") -> int:
    """Insert a message log entry and return its id."""
    with _conn() as cx:
        cur = cx.execute(
            "INSERT INTO messages"
            " (direction, from_number, to_number, body, status)"
            " VALUES (?,?,?,?,?)",
            (direction, from_number, to_number, body, status),
        )
    return cur.lastrowid


def update_message_status(msg_id: int, status: str,
                           failure_reason: Optional[str] = None):
    with _conn() as cx:
        cx.execute(
            "UPDATE messages SET status = ?, failure_reason = ?"
            " WHERE id = ?",
            (status, failure_reason, msg_id),
        )


def get_messages(limit: int = 50, direction: Optional[str] = None,
                 phone: Optional[str] = None) -> list[dict]:
    query  = "SELECT * FROM messages"
    params: list = []
    clauses: list[str] = []
    if direction:
        clauses.append("direction = ?"); params.append(direction)
    if phone:
        clauses.append("(from_number = ? OR to_number = ?)");
        params += [phone, phone]
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    with _conn() as cx:
        rows = cx.execute(query, params).fetchall()
    return [dict(r) for r in rows]


# ── App-forward stub ──────────────────────────────────────────────────────────

def notify_app(sender_phone: str, target_phone: str, message: str) -> bool:
    """
    Stub: push message to the SAPOT app backend.
    Replace with a real HTTP POST / WebSocket / queue call.
    Returns True on success.
    """
    logger.info(
        "[APP NOTIFY] %s → %s: %r", sender_phone, target_phone, message
    )
    # TODO: POST to SAPOT app API
    return True
