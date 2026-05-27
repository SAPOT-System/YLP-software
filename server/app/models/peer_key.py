import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class PeerKey(SQLModel, table=True):
    __tablename__ = "peer_key"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, unique=True)
    ecdh_public_key: str
    issued_at: datetime
    expires_at: datetime
    signature: str


class SignedCredential(SQLModel):
    peer_id: str
    ecdh_public_key: str
    issued_at: str
    expires_at: str
    signature: str


class ContactKey(SQLModel, table=True):
    """
    Stores an auth user's contact keys for peers who are NOT server-registered
    (e.g. guest peers). The public key is nacl.secretbox-encrypted under the
    auth user's master key — the server stores an opaque blob and cannot read
    the plaintext. This allows the auth user to restore conversation keys on
    a new device or after re-login.
    """

    __tablename__ = "contact_key"

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    peer_id: str = Field(index=True)  # string, not FK — peer may not be a user row
    encrypted_public_key: str          # base64(nonce || secretbox(pubkey, masterKey))

    class Config:
        # Allow the same (owner_id, peer_id) pair — updates replace via upsert
        pass
