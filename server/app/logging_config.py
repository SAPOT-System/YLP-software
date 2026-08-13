"""Activity-log handler setup for the application logger."""
import logging
import os
from logging.handlers import RotatingFileHandler

from pythonjsonlogger import jsonlogger

_MARKER = "_sapot_activity_configured"
_MAX_BYTES = 10**6
_BACKUP_COUNT = 3


def configure_activity_logging(logger: logging.Logger, log_dir: str | None = None) -> str:
    """Configure file and stdout activity handlers once and return the directory."""
    if getattr(logger, _MARKER, False):
        return getattr(logger, "_sapot_activity_dir")

    resolved = os.path.abspath(log_dir or os.environ.get("SAPOT_LOG_DIR") or "../logs")
    os.makedirs(resolved, exist_ok=True)
    json_handler = RotatingFileHandler(
        os.path.join(resolved, "activity.json"), maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT
    )
    json_handler.setFormatter(jsonlogger.JsonFormatter(
        "%(asctime)s %(levelname)s %(user_id)s %(action)s %(entity_id)s %(metadata_json)s %(message)s"
    ))
    text_handler = RotatingFileHandler(
        os.path.join(resolved, "activity.log"), maxBytes=_MAX_BYTES, backupCount=_BACKUP_COUNT
    )
    text_handler.setFormatter(logging.Formatter(
        "%(asctime)s | %(levelname)s | USER: %(user_id)s | ACTION: %(action)s | %(message)s"
    ))
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
    for handler in (json_handler, text_handler, stream_handler):
        logger.addHandler(handler)
    setattr(logger, _MARKER, True)
    setattr(logger, "_sapot_activity_dir", resolved)
    return resolved
