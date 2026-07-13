from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.fcm_device_token import FcmDeviceToken
from app.models.users import User


def upsert_device_token(
    session: Session,
    user: User,
    token: str,
    platform: str,
) -> FcmDeviceToken:
    """Register (or re-point) an FCM device token for the given admin.

    Tokens are unique per device. If the token already exists it is
    re-pointed to the current user/platform and its ``updated_at`` bumped;
    otherwise a new row is inserted. Many rows may share one ``user_id``
    (one admin, many devices).
    """
    existing = session.exec(
        select(FcmDeviceToken).where(FcmDeviceToken.token == token)
    ).first()

    if existing:
        existing.user_id = user.id
        existing.platform = platform
        existing.updated_at = datetime.now(timezone.utc)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return existing

    device_token = FcmDeviceToken(
        user_id=user.id,
        token=token,
        platform=platform,
    )
    session.add(device_token)
    session.commit()
    session.refresh(device_token)
    return device_token
