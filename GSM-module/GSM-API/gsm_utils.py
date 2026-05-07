"""
sapot/main.py
─────────────
Entry point for the SAPOT Python brain.

Usage:
  python main.py                        # uses default port from config
  python main.py --port /dev/ttyUSB0   # override port
  python main.py --port COM3           # Windows

Requires:
  pip install pyserial
"""

import argparse
import logging
import sys
import time
from datetime import datetime

import serial  # pyserial

from app.db_operations.protocol import parse_line, build_send_sms, EventType
from app.db_operations.session_manager import SessionManager
from app.db_operations.sms_handler import handle_sms
from app import gsm_runtime


# ── Configuration ─────────────────────────────────────────────────────────────
DEFAULT_PORT = "/dev/ttyACM1"   # change to COM3, /dev/ttyACM0, etc.
DEFAULT_BAUD = 9600
LOG_FILE     = "sapot_sms.log"


# ── Logging setup ─────────────────────────────────────────────────────────────
def setup_logging(log_file: str):
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    logging.basicConfig(
        level=logging.INFO,
        format=fmt,
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(log_file, encoding="utf-8"),
        ],
    )

logger = logging.getLogger("sapot.main")


# ── Serial writer helper ──────────────────────────────────────────────────────
def send_to_arduino(ser: serial.Serial, line: str):
    """Write a command line to Arduino over serial."""
    logger.debug("→ Arduino: %r", line.strip())
    ser.write(line.encode("utf-8"))


# ── Event dispatcher ──────────────────────────────────────────────────────────
def dispatch(event, ser: serial.Serial, sessions: SessionManager):
    """Route a parsed SerialEvent to the right handler."""

    if event.event_type == EventType.LOG:
        logger.info("[Arduino] %s", event.body)
        return

    if event.event_type == EventType.GSM_READY:
        logger.info("GSM module is READY")
        return

    if event.event_type == EventType.NETWORK_OK:
        logger.info("Network: OK")
        return

    if event.event_type == EventType.NETWORK_LOST:
        logger.warning("Network: LOST — Arduino will attempt reset")
        return

    if event.event_type == EventType.SIM_MISSING:
        logger.error("SIM card missing or not ready")
        return

    if event.event_type == EventType.SMS_SENT:
        logger.info("SMS delivered to %s", event.number)
        return

    if event.event_type == EventType.SMS_FAILED:
        logger.error("SMS FAILED to %s — reason: %s", event.number, event.reason)
        return

    if event.event_type == EventType.SMS_RECEIVED:
        _handle_received_sms(event.number, event.body, ser, sessions)
        return

    if event.event_type == EventType.UNKNOWN:
        # Unexpected line — log at debug so it doesn't clutter output
        logger.debug("Unrecognised line: %r", event.raw)
        return


def _handle_received_sms(number: str, body: str,
                          ser: serial.Serial, sessions: SessionManager):
    """Business logic entry point for an incoming SMS."""
    log_sms_received(number, body)

    reply = handle_sms(number, body, sessions)

    if reply:
        log_sms_sent(number, reply)
        cmd = build_send_sms(number, reply)
        send_to_arduino(ser, cmd)
    else:
        logger.info("No reply generated for %s", number)


# ── SMS log helpers ───────────────────────────────────────────────────────────
def log_sms_received(number: str, body: str):
    ts = datetime.now().strftime("%H:%M:%S")
    logger.info(
        "\n[%s] SMS_RECEIVED\n  FROM: %s\n  BODY: %s",
        ts, number, body
    )


def log_sms_sent(number: str, body: str):
    ts = datetime.now().strftime("%H:%M:%S")
    logger.info(
        "\n[%s] SMS_SENDING\n  TO:   %s\n  BODY: %s",
        ts, number, body
    )


# ── Main loop ─────────────────────────────────────────────────────────────────
def run(port: str, baud: int):
    sessions = SessionManager()

    logger.info("Connecting to Arduino on %s @ %d baud …", port, baud)

    try:
        import app.gsm_runtime as gsm_runtime
        ser = serial.Serial(port, baud, timeout=1)
        gsm_runtime.ser = ser
    except serial.SerialException as e:
        logger.error("Cannot open serial port %s: %s", port, e)
        sys.exit(1)

    # Give Arduino time to reset after serial connect
    time.sleep(2)
    logger.info("Serial port open. Waiting for GSM_READY …")

    line_buffer = ""

    try:
        while True:
            # Read available bytes
            waiting = ser.in_waiting
            if waiting > 0:
                chunk = ser.read(waiting).decode("utf-8", errors="replace")
                line_buffer += chunk

                # Process complete lines
                while "\n" in line_buffer:
                    line, line_buffer = line_buffer.split("\n", 1)
                    event = parse_line(line)
                    dispatch(event, ser, sessions)

            else:
                # Nothing to read — tiny sleep to avoid busy-wait
                time.sleep(0.05)

    except KeyboardInterrupt:
        logger.info("Shutting down (KeyboardInterrupt)")
    finally:
        ser.close()
        logger.info("Serial port closed.")


# ── CLI ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="SAPOT SMS Relay — Python Brain")
    parser.add_argument("--port", default=DEFAULT_PORT,
                        help=f"Serial port (default: {DEFAULT_PORT})")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUD,
                        help=f"Baud rate (default: {DEFAULT_BAUD})")
    parser.add_argument("--log",  default=LOG_FILE,
                        help=f"Log file path (default: {LOG_FILE})")
    args = parser.parse_args()

    setup_logging(args.log)
    run(args.port, args.baud)


if __name__ == "__main__":
    main()
