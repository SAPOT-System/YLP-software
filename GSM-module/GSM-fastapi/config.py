"""
config.py
─────────
All runtime settings in one place.
Override any value with an environment variable of the same name (uppercase).

Examples:
  SERIAL_PORT=/dev/ttyACM0 python main.py
  SERIAL_PORT=COM3 python main.py          # Windows
"""

import os
from dotenv import load_dotenv
from serial_worker import MAX_SEND_QUEUE_SIZE


def bounded_integer_env(name: str, default: int, maximum: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(
            f"Environment variable '{name}' must be an integer between 1 and {maximum}."
        ) from error
    if not 1 <= parsed <= maximum:
        raise RuntimeError(
            f"Environment variable '{name}' must be an integer between 1 and {maximum}."
        )
    return parsed


def nonnegative_integer_env(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as error:
        raise RuntimeError(
            f"Environment variable '{name}' must be a non-negative integer."
        ) from error
    if parsed < 0:
        raise RuntimeError(
            f"Environment variable '{name}' must be a non-negative integer."
        )
    return parsed


class Settings:
    load_dotenv()
    # Serial port the Arduino is connected to
    serial_port: str = os.environ.get("SERIAL_PORT", "/dev/ttyACM0")

    # Baud rate — must match PC_BAUD in the Arduino sketch (9600)
    serial_baud: int = int(os.environ.get("SERIAL_BAUD", "9600"))

    db_path: str | None = os.environ.get("DB_PATH")

    if not db_path:
        raise RuntimeError("Environment variable 'DB_PATH' is not set.")

    gsm_secret: str = os.environ.get("GSM_SECRET", "")

    if not gsm_secret:
        raise RuntimeError("Environment variable 'GSM_SECRET' is not set.")

    # FastAPI host and port
    host: str = os.environ.get("HOST", "127.0.0.1")
    port: int = int(os.environ.get("PORT", "8000"))

    # Logging level
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")

    sms_send_queue_maxsize: int = bounded_integer_env(
        "SMS_SEND_QUEUE_MAXSIZE", 10, MAX_SEND_QUEUE_SIZE
    )
    sms_incoming_queue_maxsize: int = bounded_integer_env(
        "SMS_INCOMING_QUEUE_MAXSIZE", 100, 10_000
    )
    sms_daily_send_limit: int = nonnegative_integer_env("SMS_DAILY_SEND_LIMIT", 100)
    sms_sender_daily_limit: int = nonnegative_integer_env("SMS_SENDER_DAILY_LIMIT", 20)
    sms_sender_target_daily_limit: int = nonnegative_integer_env(
        "SMS_SENDER_TARGET_DAILY_LIMIT", 10
    )
    sms_response_cooldown_seconds: int = nonnegative_integer_env(
        "SMS_RESPONSE_COOLDOWN_SECONDS", 30
    )
    sms_log_retention_days: int = nonnegative_integer_env("SMS_LOG_RETENTION_DAYS", 30)
    log_max_bytes: int = bounded_integer_env("LOG_MAX_BYTES", 1_000_000, 100_000_000)
    log_backup_count: int = bounded_integer_env("LOG_BACKUP_COUNT", 3, 100)


settings = Settings()
