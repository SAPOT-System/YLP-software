"""
main.py
───────
Entry point. Run with:

  python main.py
  SERIAL_PORT=/dev/ttyACM0 python main.py
  SERIAL_PORT=COM3 PORT=8080 python main.py

The server always binds to localhost only (127.0.0.1) so it is not
exposed to the network by default. Change HOST in config.py or via
environment variable if you need LAN access.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler

import uvicorn

from config import settings


def setup_logging():
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    fmt   = "%(asctime)s [%(levelname)-8s] %(name)s: %(message)s"
    logging.basicConfig(
        level=level,
        format=fmt,
        handlers=[
            logging.StreamHandler(sys.stdout),
            RotatingFileHandler(
                "sapot.log",
                maxBytes=settings.log_max_bytes,
                backupCount=settings.log_backup_count,
                encoding="utf-8",
            ),
        ],
    )
    # Quiet down uvicorn's access log a little
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


if __name__ == "__main__":
    setup_logging()

    logger = logging.getLogger("sapot.main")
    logger.info("Starting SAPOT SMS Relay API")
    logger.info("  Serial port : %s @ %d baud", settings.serial_port,
                settings.serial_baud)
    logger.info("  Database    : %s", settings.db_path)
    logger.info("  Listen      : http://%s:%d", settings.host, settings.port)
    logger.info("  Docs        : http://%s:%d/docs", settings.host, settings.port)

    uvicorn.run(
        "api:app",
        host=settings.host,
        port=8001,
        reload=False,       # reload=True is handy during dev but conflicts
                            # with the background serial thread
        log_config=None,    # we configure logging ourselves above
    )
