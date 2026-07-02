"""
sapot/protocol.py
─────────────────
Low-level serial line parser and command builder.

Arduino → Python EVENTS
────────────────────────
  GSM_READY
  NETWORK_OK
  NETWORK_LOST
  SIM_MISSING
  SMS_RECEIVED|<number>|<body>
  SMS_SENT|<number>
  SMS_FAILED|<number>|<reason>
  LOG|<message>

Python → Arduino COMMANDS
──────────────────────────
  SEND_SMS|<number>|<body>
"""

from dataclasses import dataclass
from typing import Optional


# ── Event types ───────────────────────────────────────────────────────────────

class EventType:
    GSM_READY     = "GSM_READY"
    NETWORK_OK    = "NETWORK_OK"
    NETWORK_LOST  = "NETWORK_LOST"
    SIM_MISSING   = "SIM_MISSING"
    SMS_RECEIVED  = "SMS_RECEIVED"
    SMS_SENT      = "SMS_SENT"
    SMS_FAILED    = "SMS_FAILED"
    LOG           = "LOG"
    UNKNOWN       = "UNKNOWN"


@dataclass
class SerialEvent:
    """Parsed event from Arduino."""
    event_type: str
    number:     Optional[str] = None   # phone number (where relevant)
    body:       Optional[str] = None   # SMS body or log message
    reason:     Optional[str] = None   # failure reason (SMS_FAILED)
    raw:        str = ""


def parse_line(line: str) -> SerialEvent:
    """
    Parse a single line from Arduino serial into a SerialEvent.
    Returns SerialEvent with event_type=UNKNOWN for unrecognised lines.
    """
    line = line.strip()
    if not line:
        return SerialEvent(event_type=EventType.UNKNOWN, raw=line)

    parts = line.split("|")
    etype = parts[0]

    if etype == EventType.GSM_READY:
        return SerialEvent(event_type=EventType.GSM_READY, raw=line)

    if etype == EventType.NETWORK_OK:
        return SerialEvent(event_type=EventType.NETWORK_OK, raw=line)

    if etype == EventType.NETWORK_LOST:
        return SerialEvent(event_type=EventType.NETWORK_LOST, raw=line)

    if etype == EventType.SIM_MISSING:
        return SerialEvent(event_type=EventType.SIM_MISSING, raw=line)

    if etype == EventType.SMS_RECEIVED and len(parts) >= 3:
        number = parts[1]
        body   = "|".join(parts[2:])   # body may contain pipes (restored)
        return SerialEvent(event_type=EventType.SMS_RECEIVED,
                           number=number, body=body, raw=line)

    if etype == EventType.SMS_SENT and len(parts) >= 2:
        return SerialEvent(event_type=EventType.SMS_SENT,
                           number=parts[1], raw=line)

    if etype == EventType.SMS_FAILED and len(parts) >= 3:
        return SerialEvent(event_type=EventType.SMS_FAILED,
                           number=parts[1], reason=parts[2], raw=line)

    if etype == EventType.LOG and len(parts) >= 2:
        return SerialEvent(event_type=EventType.LOG,
                           body="|".join(parts[1:]), raw=line)

    return SerialEvent(event_type=EventType.UNKNOWN, body=line, raw=line)


def build_send_sms(number: str, body: str) -> str:
    """
    Build the SEND_SMS command line to write to Arduino serial.
    Newlines in body are replaced with spaces to keep the protocol line-based.
    """
    safe_body = body.replace("\n", " ").replace("\r", " ")
    return f"SEND_SMS|{number}|{safe_body}\n"
