"""
sapot/database.py
─────────────────
Stub database layer.  Replace with real ORM / API calls when integrating
with the SAPOT app backend.

The two public functions are the only interface the rest of the code uses:
  lookup_number(phone)  → dict | None
  forward_message(...)  → bool
"""

from typing import Optional, Dict


# ── Fake user records ─────────────────────────────────────────────────────────
# Keys are E.164 phone numbers.
# In production this would be fetched from the SAPOT backend / database.
_FAKE_USERS: Dict[str, dict] = {
    "+639171234567": {"username": "juan_dela_cruz",  "app_active": True},
    "+639281234567": {"username": "maria_santos",    "app_active": True},
    "+639991234567": {"username": "pedro_reyes",     "app_active": False},
}


def lookup_number(phone: str) -> Optional[dict]:
    """
    Returns user dict if the number is registered in SAPOT, else None.

    Return shape:
      {
        "username":   str,
        "app_active": bool,   # whether they have an active SAPOT app account
      }
    """
    return _FAKE_USERS.get(phone)


def forward_message(sender_number: str, target_number: str,
                    message: str) -> bool:
    """
    Stub: forward an SMS message to the target via the SAPOT app backend.
    Return True on success, False on failure.

    In production: POST to SAPOT app API or write to message queue.
    """
    print(f"[DB] Forward: {sender_number} → {target_number}: {message!r}")
    # TODO: implement real forwarding (HTTP, WebSocket, queue, etc.)
    return True
