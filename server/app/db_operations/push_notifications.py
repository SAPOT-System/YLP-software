import logging
import os

import firebase_admin
from firebase_admin import credentials

logger = logging.getLogger("app")


def init_firebase() -> None:
    """Initialize the default Firebase app exactly once (idempotent)."""
    if firebase_admin._apps:
        return
    cred_path = os.environ.get("FIREBASE_ADMIN_CREDENTIALS_PATH")
    if not cred_path:
        raise RuntimeError(
            "FIREBASE_ADMIN_CREDENTIALS_PATH environment variable is not set"
        )
    firebase_admin.initialize_app(credentials.Certificate(cred_path))
    logger.info("Firebase Admin SDK initialized")
