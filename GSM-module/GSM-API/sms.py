from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.db_operations.protocol import build_send_sms
from app.db_operations.gsm_utils import send_to_arduino
from app import gsm_runtime


router = APIRouter(prefix="/sms", tags=["SMS"])


# ── Request Body ────────────────────────────────────────────────
class SendSMSRequest(BaseModel):
    number: str
    body: str


# ── Endpoint ────────────────────────────────────────────────────
@router.post("/send")
def send_sms(req: SendSMSRequest):

    # basic validation
    if not req.number.startswith("+63"):
        raise HTTPException(
            status_code=400,
            detail="Phone number must be in +63 format"
        )

    if not req.body.strip():
        raise HTTPException(
            status_code=400,
            detail="Message body cannot be empty"
        )

    try:
        # Build Arduino protocol command
        cmd = build_send_sms(req.number, req.body)

        # Send to Arduino
        send_to_arduino(gsm_runtime.ser, cmd)

        return {
            "success": True,
            "number": req.number,
            "body": req.body,
            "queued": True
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
