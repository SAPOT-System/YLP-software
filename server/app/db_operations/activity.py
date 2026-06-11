import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, Request
import jwt
from sqlmodel import Session, select
from app.db_operations.token import ALGORITHM, SECRET_KEY
from app.models.activity import UserActivity
from app.db_operations.auth import SessionDep, engine

_activity_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="activity-db")


def set_user_status(session: Session, user_id: UUID, status: str) -> None:
    """Upsert the user's activity record, stamping last_active=now and status.

    Used on WebSocket connect ("Active") and disconnect ("Inactive") so
    last_active precisely reflects when a peer was last online.
    """
    activity = session.exec(
        select(UserActivity).where(UserActivity.user_id == user_id)
    ).first()
    if not activity:
        activity = UserActivity(user_id=user_id)
        session.add(activity)
    activity.last_active = datetime.now(timezone.utc)
    activity.status = status
    session.add(activity)
    session.commit()

def _write_user_activity_sync(user_id: UUID, ip: str, user_agent: str) -> None:
    try:
        with Session(engine) as session:
            statement = select(UserActivity).where(UserActivity.user_id == user_id)
            activity = session.exec(statement).first()
            if not activity:
                activity = UserActivity(user_id=user_id, ip_address=ip, user_agent=user_agent)
                session.add(activity)
            activity.last_active = datetime.now(timezone.utc)
            activity.status = "Active"
            activity.ip_address = ip
            session.add(activity)
            session.commit()
    except Exception as e:
        print(f"[activity] write failed: {e}")


async def activity_tracking_middleware(request: Request, call_next):
    response = await call_next(request)

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return response

    try:
        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = UUID(payload.get("sub"))
        if user_id and request.client:
            loop = asyncio.get_event_loop()
            loop.run_in_executor(
                _activity_executor,
                _write_user_activity_sync,
                user_id,
                request.client.host,
                request.headers.get("user-agent", ""),
            )
    except Exception:
        pass

    return response
