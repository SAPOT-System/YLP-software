import os
import requests

SAPOT_URL = os.getenv("SAPOT_API_URL", "http://localhost:8000")
GSM_SECRET = os.getenv("GSM_SECRET", "")
_HEADERS = {"X-GSM-Secret": GSM_SECRET}


def lookup_number(phone: str) -> dict | None:
    """
    Returns { user_id, username } if the phone number belongs to a registered
    SAPOT user, else None.
    """
    try:
        r = requests.get(
            f"{SAPOT_URL}/gsm/users/by-phone/{phone}",
            headers=_HEADERS,
            timeout=5,
        )
        if r.status_code == 200:
            return r.json()
        return None
    except Exception:
        return None


def forward_message(sender_number: str, target_number: str, message: str) -> bool:
    """
    POST the inbound SMS to the SAPOT server, which persists it and pushes
    it to the target user via WebSocket.
    Returns True on success.
    """
    try:
        r = requests.post(
            f"{SAPOT_URL}/gsm/inbound",
            json={
                "sender_phone": sender_number,
                "target_phone": target_number,
                "body": message,
            },
            headers=_HEADERS,
            timeout=10,
        )
        return r.status_code == 200
    except Exception:
        return False
