#!/usr/bin/env python3
import base64
import hashlib
import hmac
import struct
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlmodel import Session, select

from app.config import DEVICE_CHALLENGE_SECRET
from app.models.device_key import DeviceKey
from app.models.login_attempt import LoginAttempt, RecoveryAttempt

ATTEMPT_BUDGETS: dict[str, int] = {
    "same_device": 10,
    "new_device": 3,
    "known_other": 6,
    "anonymous": 5,   # IP-based fallback; no device key present
}

COOLDOWN_TIERS: dict[str, list[int]] = {
    "same_device": [5, 15, 60, 1440],
    "new_device": [30, 120, 720, 1440],
    "known_other": [30, 120, 720, 1440],
    "anonymous": [15, 60, 360, 1440],
}

NONCE_TTL_SECONDS = 60


def generate_challenge_nonce(fingerprint: str) -> dict:
    timestamp = int(time.time())
    fp_hash = hashlib.sha256(fingerprint.encode()).digest()[:8]
    raw = struct.pack(">Q", timestamp) + fp_hash
    nonce = base64.urlsafe_b64encode(raw).decode()
    mac = hmac.new(
        DEVICE_CHALLENGE_SECRET.encode(),
        nonce.encode(),
        hashlib.sha256,
    ).hexdigest()
    return {"nonce": nonce, "mac": mac}


def verify_challenge_nonce(nonce: str, mac: str) -> bool:
    try:
        expected_mac = hmac.new(
            DEVICE_CHALLENGE_SECRET.encode(),
            nonce.encode(),
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected_mac, mac):
            return False
        raw = base64.urlsafe_b64decode(nonce)
        if len(raw) < 8:
            return False
        timestamp = struct.unpack(">Q", raw[:8])[0]
        age = int(time.time()) - timestamp
        return 0 <= age <= NONCE_TTL_SECONDS
    except Exception:
        return False


def verify_device_signature(public_key_b64: str, nonce: str, signature_b64: str) -> bool:
    try:
        key_bytes = base64.b64decode(public_key_b64)
        sig_bytes = base64.b64decode(signature_b64)
        nonce_bytes = nonce.encode()
        pub_key = Ed25519PublicKey.from_public_bytes(key_bytes)
        pub_key.verify(sig_bytes, nonce_bytes)
        return True
    except (InvalidSignature, ValueError, Exception):
        return False


def get_device_type(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
) -> str:
    same = session.exec(
        select(DeviceKey).where(
            DeviceKey.user_id == user_id,
            DeviceKey.device_fingerprint == device_fingerprint,
        )
    ).first()
    if same:
        return "same_device"

    other = session.exec(
        select(DeviceKey).where(
            DeviceKey.device_fingerprint == device_fingerprint,
            DeviceKey.user_id != user_id,
        )
    ).first()
    if other:
        return "known_other"

    return "new_device"


def _get_or_create_login_attempt(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
    device_type: str,
) -> LoginAttempt:
    row = session.exec(
        select(LoginAttempt).where(
            LoginAttempt.user_id == user_id,
            LoginAttempt.device_fingerprint == device_fingerprint,
        ).with_for_update()
    ).first()
    if not row:
        row = LoginAttempt(
            user_id=user_id,
            device_fingerprint=device_fingerprint,
            device_type=device_type,
        )
        session.add(row)
        session.flush()
    return row


def _get_or_create_recovery_attempt(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
    device_type: str,
    recovery_method: str,
) -> RecoveryAttempt:
    row = session.exec(
        select(RecoveryAttempt).where(
            RecoveryAttempt.user_id == user_id,
            RecoveryAttempt.device_fingerprint == device_fingerprint,
            RecoveryAttempt.recovery_method == recovery_method,
        ).with_for_update()
    ).first()
    if not row:
        row = RecoveryAttempt(
            user_id=user_id,
            device_fingerprint=device_fingerprint,
            device_type=device_type,
            recovery_method=recovery_method,
        )
        session.add(row)
        session.flush()
    return row


def check_and_increment_attempt(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
    device_type: str,
    *,
    table: Literal["login", "recovery"] = "login",
    recovery_method: Optional[str] = None,
) -> dict:
    now = datetime.now(timezone.utc)

    if table == "login":
        row = _get_or_create_login_attempt(session, user_id, device_fingerprint, device_type)
    else:
        row = _get_or_create_recovery_attempt(
            session, user_id, device_fingerprint, device_type, recovery_method or ""
        )

    if row.locked_until:
        locked_until_aware = row.locked_until.replace(tzinfo=timezone.utc) if row.locked_until.tzinfo is None else row.locked_until
        if locked_until_aware > now:
            return {
                "allowed": False,
                "locked_until": locked_until_aware,
                "attempts_remaining": 0,
                "device_type": device_type,
            }
        row.attempt_count = 0
        row.locked_until = None

    row.attempt_count += 1
    row.last_attempt_at = now
    budget = ATTEMPT_BUDGETS.get(device_type, 3)
    remaining = budget - row.attempt_count

    if remaining <= 0:
        tier = min(row.lockout_count, len(COOLDOWN_TIERS[device_type]) - 1)
        cooldown_minutes = COOLDOWN_TIERS[device_type][tier]
        locked_until = now + timedelta(minutes=cooldown_minutes)
        row.locked_until = locked_until
        row.lockout_count += 1
        session.add(row)
        session.commit()
        return {
            "allowed": False,
            "locked_until": locked_until,
            "attempts_remaining": 0,
            "device_type": device_type,
        }

    session.add(row)
    session.commit()
    return {
        "allowed": True,
        "locked_until": None,
        "attempts_remaining": remaining,
        "device_type": device_type,
    }


def reset_attempts(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
    *,
    table: Literal["login", "recovery"] = "login",
    recovery_method: Optional[str] = None,
) -> None:
    if table == "login":
        row = session.exec(
            select(LoginAttempt).where(
                LoginAttempt.user_id == user_id,
                LoginAttempt.device_fingerprint == device_fingerprint,
            )
        ).first()
    else:
        row = session.exec(
            select(RecoveryAttempt).where(
                RecoveryAttempt.user_id == user_id,
                RecoveryAttempt.device_fingerprint == device_fingerprint,
                RecoveryAttempt.recovery_method == (recovery_method or ""),
            )
        ).first()

    if row:
        row.attempt_count = 0
        row.locked_until = None
        session.add(row)
        session.commit()


def bind_device_key(
    session: Session,
    user_id: uuid.UUID,
    device_fingerprint: str,
    public_key_b64: str,
) -> None:
    existing = session.exec(
        select(DeviceKey).where(
            DeviceKey.user_id == user_id,
            DeviceKey.device_fingerprint == device_fingerprint,
        )
    ).first()

    now = datetime.now(timezone.utc)
    if existing:
        existing.last_seen = now
        session.add(existing)
    else:
        session.add(
            DeviceKey(
                user_id=user_id,
                device_fingerprint=device_fingerprint,
                public_key_b64=public_key_b64,
                bound_at=now,
                last_seen=now,
            )
        )
    session.commit()
