"""
serial_worker.py
────────────────
Background thread that owns the serial port.

Public interface (thread-safe):
  worker.send_sms(number, body, timeout=30) -> dict
    Blocks until SMS_SENT or SMS_FAILED arrives (or timeout).
    Returns {"ok": True/False, "reason": str|None}

  worker.gsm_ready   -> bool   (modem initialised and on network)
  worker.connected   -> bool   (serial port is open)
  worker.last_status -> str    (human-readable last known status)

Incoming SMS events are put on worker.incoming_queue as SerialEvent objects.
The FastAPI lifespan task drains that queue and calls the SMS handler.

Auto-reconnect:
  If the port goes away (USB unplugged, Arduino reset) the worker waits
  RECONNECT_DELAY seconds then tries to reopen.  The FastAPI layer stays
  running throughout; it will report "not connected" on health checks.
"""

import logging
import queue
import threading
import time
from typing import Optional

import serial

from protocol import EventType, SerialEvent, build_send_sms, parse_line

logger = logging.getLogger("sapot.serial")

RECONNECT_DELAY = 5   # seconds between reconnect attempts


class _PendingSMS:
    """Tracks a single in-flight SEND_SMS command."""
    def __init__(self, number: str):
        self.number  = number
        self.event   = threading.Event()
        self.success = False
        self.reason: Optional[str] = None


class SerialWorker:
    """
    Owns the serial port in a dedicated background thread.
    All serial reads and writes happen in that thread only.
    """

    def __init__(self, port: str, baud: int = 9600):
        self._port       = port
        self._baud       = baud
        self._ser: Optional[serial.Serial] = None
        self._lock       = threading.Lock()      # protects _ser writes
        self._stop_event = threading.Event()

        # Incoming SMS events for the application layer to consume
        self.incoming_queue: queue.Queue[SerialEvent] = queue.Queue()

        # In-flight SMS delivery tracking (one at a time — GSM is serial)
        self._pending: Optional[_PendingSMS] = None
        self._pending_lock = threading.Lock()

        # Status flags readable from FastAPI thread
        self.connected   = False
        self.gsm_ready   = False
        self.last_status = "not started"

        self._thread = threading.Thread(target=self._run, name="serial-worker",
                                        daemon=True)

    def start(self):
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        self._thread.join(timeout=5)

    # ── Public API ────────────────────────────────────────────────────────────

    def send_sms(self, number: str, body: str,
                 timeout: float = 30.0) -> dict:
        """
        Send an SMS and block until delivery confirmation arrives.

        Returns {"ok": True/False, "reason": str|None}
        Raises RuntimeError if the modem is not ready.
        """
        if not self.gsm_ready:
            raise RuntimeError("GSM modem not ready")
        if not self.connected:
            raise RuntimeError("Serial port not connected")

        pending = _PendingSMS(number)

        with self._pending_lock:
            if self._pending is not None:
                raise RuntimeError("Another SMS is already in flight")
            self._pending = pending

        cmd = build_send_sms(number, body)
        try:
            with self._lock:
                if self._ser and self._ser.is_open:
                    self._ser.write(cmd.encode("utf-8"))
                else:
                    raise RuntimeError("Serial port not open")
        except Exception as e:
            with self._pending_lock:
                self._pending = None
            raise RuntimeError(f"Serial write failed: {e}") from e

        logger.info("SMS queued to %s, waiting for confirmation…", number)
        delivered = pending.event.wait(timeout=timeout)

        with self._pending_lock:
            self._pending = None

        if not delivered:
            return {"ok": False, "reason": "TIMEOUT"}
        return {"ok": pending.success, "reason": pending.reason}

    # ── Background thread ─────────────────────────────────────────────────────

    def _run(self):
        while not self._stop_event.is_set():
            try:
                self._connect_and_read()
            except Exception as e:
                logger.error("Serial worker crashed: %s", e)

            if self._stop_event.is_set():
                break

            self.connected   = False
            self.gsm_ready   = False
            self.last_status = f"disconnected — retrying in {RECONNECT_DELAY}s"
            logger.warning("Serial disconnected. Reconnecting in %ds…",
                           RECONNECT_DELAY)
            time.sleep(RECONNECT_DELAY)

    def _connect_and_read(self):
        logger.info("Opening serial port %s @ %d", self._port, self._baud)
        try:
            ser = serial.Serial(self._port, self._baud, timeout=1)
        except serial.SerialException as e:
            logger.error("Cannot open %s: %s", self._port, e)
            self.last_status = f"port error: {e}"
            time.sleep(RECONNECT_DELAY)
            return

        with self._lock:
            self._ser = ser

        self.connected   = True
        self.last_status = "serial open, waiting for GSM_READY"
        logger.info("Serial port open")

        buf = ""
        try:
            while not self._stop_event.is_set():
                chunk = ser.read(ser.in_waiting or 1)
                if not chunk:
                    continue
                buf += chunk.decode("utf-8", errors="replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    self._handle_line(line.strip())
        except serial.SerialException as e:
            logger.error("Serial read error: %s", e)
        finally:
            with self._lock:
                try:
                    ser.close()
                except Exception:
                    pass
                self._ser = None
            self.connected = False
            self.gsm_ready = False
            # Wake any pending SMS waiter so it doesn't hang forever
            with self._pending_lock:
                if self._pending:
                    self._pending.success = False
                    self._pending.reason  = "SERIAL_DISCONNECTED"
                    self._pending.event.set()
                    self._pending = None

    def _handle_line(self, line: str):
        if not line:
            return

        event = parse_line(line)

        if event.event_type == EventType.LOG:
            logger.info("[Arduino] %s", event.body)
            return

        if event.event_type == EventType.GSM_READY:
            self.gsm_ready   = True
            self.last_status = "GSM ready"
            logger.info("GSM modem READY")
            return

        if event.event_type == EventType.NETWORK_OK:
            self.last_status = "network OK"
            return

        if event.event_type == EventType.NETWORK_LOST:
            self.gsm_ready   = False
            self.last_status = "network lost"
            logger.warning("Network LOST")
            return

        if event.event_type == EventType.SIM_MISSING:
            self.gsm_ready   = False
            self.last_status = "SIM missing"
            logger.error("SIM card missing")
            return

        if event.event_type == EventType.SMS_SENT:
            self._resolve_pending(event.number, success=True, reason=None)
            return

        if event.event_type == EventType.SMS_FAILED:
            self._resolve_pending(event.number, success=False,
                                  reason=event.reason)
            return

        if event.event_type == EventType.SMS_RECEIVED:
            logger.info("SMS from %s: %r", event.number, event.body)
            self.incoming_queue.put(event)
            return

        logger.debug("Unhandled event: %r", event.raw)

    def _resolve_pending(self, number: str, success: bool,
                         reason: Optional[str]):
        with self._pending_lock:
            p = self._pending
        if p and p.number == number:
            p.success = success
            p.reason  = reason
            p.event.set()
            logger.info("SMS to %s resolved: ok=%s reason=%s",
                        number, success, reason)
        else:
            logger.warning("SMS_SENT/FAILED for %s but no pending found",
                           number)
