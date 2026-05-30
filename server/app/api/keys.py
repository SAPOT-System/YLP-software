import base64
import uuid
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlmodel import select

from app.db_operations.auth import SessionDep
from app.db_operations.signing import SERVER_VERIFY_KEY_B64, sign_payload
from app.db_operations.token import get_current_user
from app.models.peer_key import ContactKey, PeerKey, SignedCredential
from app.models.users import User

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/keys",
    tags=["keys"],
    responses={404: {"description": "Not Found"}},
)


class RegisterKeyRequest(BaseModel):
    ecdh_public_key: str  # base64-encoded 32-byte Curve25519 pubkey


@router.post("/register", response_model=SignedCredential)
@limiter.limit("3/minute")
def register_key(
    request: Request,
    body: RegisterKeyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    try:
        raw = base64.b64decode(body.ecdh_public_key)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid base64 for ecdh_public_key")
    if len(raw) != 32:
        raise HTTPException(status_code=422, detail="ecdh_public_key must be 32 bytes")

    issued_at = datetime.utcnow()
    expires_at = issued_at + timedelta(days=365)

    payload_str = f"{current_user.id}:{body.ecdh_public_key}:{issued_at.isoformat()}:{expires_at.isoformat()}"
    sig_bytes = sign_payload(payload_str.encode())
    sig_b64 = base64.b64encode(sig_bytes).decode()

    existing = session.exec(select(PeerKey).where(PeerKey.user_id == current_user.id)).first()
    if existing:
        session.delete(existing)
        session.commit()

    peer_key = PeerKey(
        user_id=current_user.id,
        ecdh_public_key=body.ecdh_public_key,
        issued_at=issued_at,
        expires_at=expires_at,
        signature=sig_b64,
    )
    session.add(peer_key)
    session.commit()

    return SignedCredential(
        peer_id=str(current_user.id),
        ecdh_public_key=body.ecdh_public_key,
        issued_at=issued_at.isoformat(),
        expires_at=expires_at.isoformat(),
        signature=sig_b64,
    )


@router.get("/server-public-key")
def get_server_public_key():
    return {"ed25519PublicKey": SERVER_VERIFY_KEY_B64}


# ── Contact key backup (for guest peer public keys) ───────────────────────────

class UpsertContactKeyRequest(BaseModel):
    encrypted_public_key: str  # base64(nonce || nacl.secretbox(peerPubKey, masterKey))


@router.post("/contacts/{peer_id}", status_code=201)
@limiter.limit("30/minute")
def upsert_contact_key(
    request: Request,
    peer_id: str,
    body: UpsertContactKeyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    """
    Backs up a peer's ECDH public key, encrypted under the caller's master key.
    Used for guest peers who are not server-registered and whose keys are
    otherwise only available from a local TCP handshake. Upserts on conflict.
    """
    existing = session.exec(
        select(ContactKey).where(
            ContactKey.owner_id == current_user.id,
            ContactKey.peer_id == peer_id,
        )
    ).first()

    if existing:
        existing.encrypted_public_key = body.encrypted_public_key
        session.add(existing)
    else:
        session.add(
            ContactKey(
                owner_id=current_user.id,
                peer_id=peer_id,
                encrypted_public_key=body.encrypted_public_key,
            )
        )
    session.commit()
    return {"message": "contact key stored"}


@router.get("/contacts")
@limiter.limit("10/minute")
def list_contact_keys(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    """
    Returns all backed-up contact keys for the authenticated user.
    The blobs are opaque to the server — only the user can decrypt them.
    """
    rows = session.exec(
        select(ContactKey).where(ContactKey.owner_id == current_user.id)
    ).all()
    return [
        {"peer_id": row.peer_id, "encrypted_public_key": row.encrypted_public_key}
        for row in rows
    ]


# ── Peer type lookup (guest vs authenticated) ─────────────────────────────────

@router.get("/{peer_id}/type")
def get_peer_type(
    peer_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    """Returns whether peer_id is a guest (no registered PeerKey) or authenticated."""
    has_key = session.exec(select(PeerKey).where(PeerKey.user_id == peer_id)).first()
    return {"is_guest": has_key is None}


# ── Per-peer signed key lookup ─────────────────────────────────────────────────

@router.get("/{peer_id}", response_model=SignedCredential)
def get_peer_key(
    peer_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    session: SessionDep,
):
    peer_key = session.exec(select(PeerKey).where(PeerKey.user_id == peer_id)).first()
    if not peer_key:
        raise HTTPException(status_code=404, detail="Key not found")
    return SignedCredential(
        peer_id=str(peer_key.user_id),
        ecdh_public_key=peer_key.ecdh_public_key,
        issued_at=peer_key.issued_at.isoformat(),
        expires_at=peer_key.expires_at.isoformat(),
        signature=peer_key.signature,
    )
