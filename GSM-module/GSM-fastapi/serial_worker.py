"""
serial_worker.py
────────────────
Background thread that owns the serial port.

Public interface (thread-safe):
  worker.send_sms(number, body, timeout=30) -> dict
    Enqueues the SMS and blocks until delivery confirmed or timeout.
    Returns {"ok": True/False, "reason": str|None}
    Multiple callers are safe — they queue and execute one at a time.

  worker.gsm_ready   -> bool
  worker.connected   -> bool
  worker.last_status -> str

Incoming SMS events land on worker.incoming_queue as SerialEvent objects.

Auto-reconnect:
  Serial errors fail the active send and trigger a reconnect loop. Waiting
  sends remain queued for recovery. The API stays up throughout.
"""

import logging
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import serial

from protocol import EventType, SerialEvent, build_send_sms, parse_line

logger = logging.getLogger("sapot.serial")

RECONNECT_DELAY = 10   # seconds between reconnect attempts
MAX_SEND_QUEUE_SIZE = 20


class OutboundQueueFullError(RuntimeError):
    pass


class WorkerStoppingError(RuntimeError):
    pass


@dataclass
class _SendRequest:
    """One pending send_sms() call, passed through the internal queue."""
    number:  str
    body:    str
    timeout: float
    done:    threading.Event = field(default_factory=threading.Event)
    success: bool            = False
    reason:  Optional[str]   = None


class SerialWorker:
    """
    Owns the serial port in one dedicated reader thread.
    A separate sender thread drains the outbound queue so that
    multiple callers to send_sms() always serialise correctly —
    no "another SMS in flight" errors, no dropped forwards.

    Flow for each send_sms() call:
      caller thread  →  enqueue _SendRequest  →  sender thread writes to serial
      Arduino confirms →  reader thread resolves _SendRequest  →  caller unblocks
    """

    def __init__(self, port: str, baud: int = 9600,
                 send_queue_maxsize: int = 10):
        if not 1 <= send_queue_maxsize <= MAX_SEND_QUEUE_SIZE:
            raise ValueError(
                f"send_queue_maxsize must be between 1 and {MAX_SEND_QUEUE_SIZE}"
            )
        self._port = port
        self._baud = baud

        self._ser: Optional[serial.Serial] = None
        self._ser_lock = threading.Lock()   # guards writes to _ser

        self._stop = threading.Event()
        self._lifecycle_lock = threading.Lock()
        self._accepting = True
        self._stop_lock = threading.Lock()

        self._send_queue: queue.Queue[_SendRequest] = queue.Queue(
            maxsize=send_queue_maxsize)

        self._active_request: Optional[_SendRequest] = None
        self._active_lock = threading.Lock()

        # The one request currently being sent (set by sender, read by reader)
        self._in_flight: Optional[_SendRequest] = None
        self._in_flight_lock = threading.Lock()

        # Inbound SMS for the application layer
        self.incoming_queue: queue.Queue[SerialEvent] = queue.Queue()

        # Public status flags
        self.connected   = False
        self.gsm_ready   = False
        self.last_status = "not started"

        self._reader_thread = threading.Thread(
            target=self._reader_loop, name="serial-reader", daemon=True)
        self._sender_thread = threading.Thread(
            target=self._sender_loop, name="serial-sender", daemon=True)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self):
        self._reader_thread.start()
        self._sender_thread.start()

    def stop(self):
        with self._stop_lock:
            if self._stop.is_set():
                return

            with self._lifecycle_lock:
                self._accepting = False
                self._stop.set()

            self._drain_queued_requests()
            self._fail_active_request("SERVICE_STOPPING")
            self._reader_thread.join(timeout=5)
            self._sender_thread.join(timeout=5)

    # ── Public API ────────────────────────────────────────────────────────────

    def send_sms(self, number: str, body: str,
                 timeout: float = 60.0) -> dict:
        """
        Queue an SMS for delivery and block until the modem confirms it.

        Multiple concurrent callers are safe — they queue up and each
        waits for their own confirmation.

        Returns {"ok": bool, "reason": str|None}
        Raises RuntimeError if modem not ready or port not connected.
        """
        req = _SendRequest(number=number, body=body, timeout=timeout)
        with self._lifecycle_lock:
            if not self._accepting:
                raise WorkerStoppingError("SMS service is stopping")
            if not self.connected:
                raise RuntimeError("Serial port not connected")
            if not self.gsm_ready:
                raise RuntimeError("GSM modem not ready")
            try:
                self._send_queue.put_nowait(req)
            except queue.Full as error:
                logger.warning(
                    "Outbound SMS queue full (depth=%d capacity=%d)",
                    self._send_queue.qsize(), self.outbound_queue_capacity)
                raise OutboundQueueFullError("Outbound SMS queue is full") from error
        logger.info("SMS enqueued to %s (queue depth %d)",
                    number, self._send_queue.qsize())

        # Block until the sender + reader threads resolve this request
        delivered = req.done.wait(timeout=timeout + 5)  # +5 s buffer
        if not delivered:
            return {"ok": False, "reason": "CLIENT_TIMEOUT"}
        return {"ok": req.success, "reason": req.reason}

    @property
    def outbound_queue_depth(self) -> int:
        return self._send_queue.qsize()

    @property
    def outbound_queue_capacity(self) -> int:
        return self._send_queue.maxsize

    @property
    def outbound_in_flight(self) -> bool:
        with self._in_flight_lock:
            return self._in_flight is not None

    # ── Sender thread: one at a time, in order ────────────────────────────────

    def _sender_loop(self):
        """
        Pulls _SendRequest objects from _send_queue one by one.
        Writes the AT command to serial, then waits for the reader thread
        to resolve the request (via _resolve_in_flight).
        """
        while not self._stop.is_set():
            try:
                req = self._send_queue.get(timeout=1)
            except queue.Empty:
                continue

            with self._lifecycle_lock:
                if not self._accepting:
                    self._complete_request(req, False, "SERVICE_STOPPING")
                    continue
                with self._active_lock:
                    self._active_request = req

            # Wait until modem is ready (e.g. after reconnect)
            deadline = time.time() + req.timeout
            while not self.gsm_ready and time.time() < deadline:
                time.sleep(0.5)

            if not self.gsm_ready:
                self._complete_active_request(req, False, "MODEM_NOT_READY")
                logger.warning("SMS to %s dropped: modem not ready", req.number)
                continue

            cmd = build_send_sms(req.number, req.body)
            if not self._write_active_request(req, cmd):
                self._clear_active_request(req)
                continue

            # Block here until the reader resolves this request
            # (or until the per-SMS timeout expires)
            resolved = req.done.wait(timeout=req.timeout)
            if not resolved:
                if self._complete_in_flight(req, False, "TIMEOUT"):
                    logger.error("SMS to %s timed out", req.number)
            self._clear_active_request(req)

    # ── Reader thread: serial → events ────────────────────────────────────────

    def _reader_loop(self):
        """Outer loop: reconnect forever until stop() is called."""
        while not self._stop.is_set():
            try:
                self._connect_and_read()
            except Exception as e:
                logger.error("Reader crashed: %s", e)

            if self._stop.is_set():
                break

            self.connected   = False
            self.gsm_ready   = False
            self.last_status = f"disconnected; retrying in {RECONNECT_DELAY}s"
            logger.warning("Reconnecting in %ds…", RECONNECT_DELAY)

            # Fail any in-flight request so the sender doesn't hang
            self._fail_active_request("SERIAL_DISCONNECTED")

            time.sleep(RECONNECT_DELAY)

    def _connect_and_read(self):
        logger.info("Opening %s @ %d baud", self._port, self._baud)
        try:
            ser = serial.Serial(self._port, self._baud, timeout=1,
                                write_timeout=5.0)
        except serial.SerialException as e:
            logger.error("Cannot open %s: %s", self._port, e)
            self.last_status = f"port error: {e}"
            time.sleep(RECONNECT_DELAY)
            return

        with self._ser_lock:
            self._ser = ser

        self.connected   = True
        self.last_status = "serial open, waiting for GSM_READY"
        logger.info("Port open")

        buf = ""
        try:
            while not self._stop.is_set():
                chunk = ser.read(ser.in_waiting or 1)
                if not chunk:
                    continue
                buf += chunk.decode("utf-8", errors="replace")
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    self._handle_line(line.strip())
        except serial.SerialException as e:
            logger.error("Read error: %s", e)
        finally:
            with self._ser_lock:
                try:
                    ser.close()
                except Exception:
                    pass
                self._ser = None
            self.connected = False
            self.gsm_ready = False

    # ── Line handler (called by reader thread) ────────────────────────────────

    def _handle_line(self, line: str):
        if not line:
            return

        event = parse_line(line)
        etype = event.event_type

        if etype == EventType.LOG:
            logger.info("[Arduino] %s", event.body)
            return

        if etype == EventType.GSM_READY:
            self.gsm_ready   = True
            self.last_status = "GSM ready"
            logger.info("GSM modem READY")
            return

        if etype == EventType.NETWORK_OK:
            self.last_status = "network OK"
            return

        if etype == EventType.NETWORK_LOST:
            self.gsm_ready   = False
            self.last_status = "network lost"
            logger.warning("Network LOST; in-flight SMS will fail")
            self._fail_active_request("NETWORK_LOST")
            return

        if etype == EventType.SIM_MISSING:
            self.gsm_ready   = False
            self.last_status = "SIM missing"
            logger.error("SIM missing")
            self._fail_active_request("SIM_MISSING")
            return

        if etype == EventType.SMS_SENT:
            logger.info("SMS_SENT confirmed for %s", event.number)
            self._resolve_in_flight(event.number, success=True, reason=None)
            return

        if etype == EventType.SMS_FAILED:
            logger.error("SMS_FAILED for %s reason=%s", event.number,
                         event.reason)
            self._resolve_in_flight(event.number, success=False,
                                    reason=event.reason)
            return

        if etype == EventType.SMS_RECEIVED:
            logger.info("SMS_RECEIVED from %s: %r", event.number, event.body)
            self.incoming_queue.put(event)
            return

        logger.debug("Unhandled: %r", event.raw)

    # ── In-flight helpers ─────────────────────────────────────────────────────

    def _resolve_in_flight(self, number: str, success: bool,
                            reason: Optional[str]):
        with self._in_flight_lock:
            req = self._in_flight
            if req is None:
                logger.warning("SMS_SENT/FAILED for %s but nothing in flight",
                               number)
                return
            if req.number != number:
                logger.warning(
                    "SMS_SENT/FAILED number mismatch: expected %s got %s",
                    req.number, number)
                return
        self._complete_in_flight(req, success, reason)

    def _write_active_request(self, req: _SendRequest, cmd: str) -> bool:
        # Active state serializes failure with the transition to in-flight.
        with self._active_lock:
            if self._active_request is not req or req.done.is_set():
                return False
            with self._in_flight_lock:
                self._in_flight = req
                try:
                    with self._ser_lock:
                        if not self._ser or not self._ser.is_open:
                            raise OSError("Serial port not open")
                        self._ser.write(cmd.encode("utf-8"))
                except Exception as error:
                    logger.error("Serial write failed: %s", error)
                    self._in_flight = None
                    self._complete_request(req, False, f"WRITE_ERROR: {error}")
                    return False

        logger.info("SMS sent to serial: to=%s body=%r", req.number, req.body)
        return True

    def _fail_active_request(self, reason: str):
        with self._active_lock:
            req = self._active_request
            if req is None:
                return
            if not req.done.is_set():
                if not self._complete_in_flight(req, False, reason):
                    self._complete_request(req, False, reason)
                logger.warning("Active SMS to %s failed: %s", req.number, reason)
            self._active_request = None

    def _complete_active_request(self, req: _SendRequest, success: bool,
                                 reason: Optional[str]) -> bool:
        with self._active_lock:
            if self._active_request is not req or req.done.is_set():
                return False
            if not self._complete_in_flight(req, success, reason):
                self._complete_request(req, success, reason)
            self._active_request = None
            return True

    def _clear_active_request(self, req: _SendRequest):
        with self._active_lock:
            if self._active_request is req:
                self._active_request = None

    def _complete_in_flight(self, req: _SendRequest, success: bool,
                            reason: Optional[str]) -> bool:
        with self._in_flight_lock:
            if self._in_flight is not req:
                return False
            self._in_flight = None
            req.success = success
            req.reason = reason
            req.done.set()
            return True

    @staticmethod
    def _complete_request(req: _SendRequest, success: bool,
                          reason: Optional[str]):
        req.success = success
        req.reason = reason
        req.done.set()

    def _drain_queued_requests(self):
        while True:
            try:
                req = self._send_queue.get_nowait()
            except queue.Empty:
                return
            self._complete_request(req, False, "SERVICE_STOPPING")
