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


class Settings:
    load_dotenv()
    # Serial port the Arduino is connected to
    serial_port: str = os.environ.get("SERIAL_PORT", "/dev/ttyACM0")

    # Baud rate — must match PC_BAUD in the Arduino sketch (9600)
    serial_baud: int = int(os.environ.get("SERIAL_BAUD", "9600"))

    # SQLite database file path
    db_path: str | None = os.environ.get("DB_PATH")

    if not db_path:
        raise RuntimeError("Environment variable 'DB_PATH' is not set.")

    # FastAPI host and port
    host: str = os.environ.get("HOST", "127.0.0.1")
    port: int = int(os.environ.get("PORT", "8000"))

    # Logging level
    log_level: str = os.environ.get("LOG_LEVEL", "INFO")


settings = Settings()
