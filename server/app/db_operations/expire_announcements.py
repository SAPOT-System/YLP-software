import time
from datetime import datetime, timedelta, timezone
from sqlalchemy import update as sa_update, text
from sqlmodel import Session
from app.db_operations.auth import engine
from app.models.announcement import Announcement, AnnouncementStatusType
from app.db_operations.token import purge_expired_blacklist_cache

_CLEANUP_INTERVAL = 20  # run TTL cleanup every N announcement-expiry cycles (~10 min)
_cleanup_counter = 0


def _run_ttl_cleanup(session: Session, now: datetime) -> None:
    cutoff = now - timedelta(days=7)
    r1 = session.exec(text("DELETE FROM activitylog WHERE created_at < :cutoff").bindparams(cutoff=cutoff))
    r2 = session.exec(text("DELETE FROM blacklistedtoken WHERE expires_at < :now").bindparams(now=now))
    session.commit()
    purge_expired_blacklist_cache()
    if r1.rowcount or r2.rowcount:
        print(f"[cleanup] removed {r1.rowcount} activity_logs, {r2.rowcount} expired JTIs")


def expire_announcements_loop():
    global _cleanup_counter
    backoff = 5
    while True:
        try:
            now = datetime.now(timezone.utc)
            with Session(engine) as session:
                stmt = (
                    sa_update(Announcement)
                    .where(
                        Announcement.status == AnnouncementStatusType.active,
                        Announcement.expires_at <= now,
                    )
                    .values(status=AnnouncementStatusType.expired)
                    .execution_options(synchronize_session=False)
                )
                result = session.exec(stmt)
                session.commit()
                if result.rowcount:
                    print(f"[expiry] expired {result.rowcount} announcements")

                _cleanup_counter += 1
                if _cleanup_counter >= _CLEANUP_INTERVAL:
                    _cleanup_counter = 0
                    _run_ttl_cleanup(session, now)

            backoff = 5
        except Exception as e:
            print(f"[Expiry Worker Error] {e}")
            time.sleep(backoff)
            backoff = min(backoff * 2, 120)
            continue

        time.sleep(30)
