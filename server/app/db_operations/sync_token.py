
import jwt
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

SYNC_TOKEN_SECRET_KEY = "secret-for-sync-token"
ALGORITHM = "HS256"


def create_sync_token(payload: Dict[str, Any], expires_in: int = 3600) -> str:
    """
    Creates a signed JWT sync token.

    payload: dictionary payload to include in token
    expires_in: expiration time in seconds (default 1 hour)
    """

    now = datetime.now(timezone.utc)

    token_payload = {
        **payload,
        "iat": now,
        "exp": now + timedelta(seconds=expires_in),
    }

    token = jwt.encode(token_payload, SYNC_TOKEN_SECRET_KEY, algorithm=ALGORITHM)
    return token


def verify_sync_token(token: str) -> Dict[str, Any]:
    """
    Verifies and decodes a JWT sync token.

    Returns decoded payload if valid.
    Raises jwt exceptions if invalid.
    """

    decoded = jwt.decode(token, SYNC_TOKEN_SECRET_KEY, algorithms=[ALGORITHM])
    return decoded
