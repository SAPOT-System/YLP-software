import base64
import os
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

_seed_hex = os.environ.get("SERVER_ED25519_SEED")
if not _seed_hex:
    raise RuntimeError("SERVER_ED25519_SEED environment variable is not set")

_private_key = Ed25519PrivateKey.from_private_bytes(bytes.fromhex(_seed_hex))
_public_key = _private_key.public_key()

SERVER_VERIFY_KEY_B64: str = base64.b64encode(
    _public_key.public_bytes_raw()
).decode()


def sign_payload(payload: bytes) -> bytes:
    return _private_key.sign(payload)
