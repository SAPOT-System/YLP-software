import time
from datetime import datetime, timezone
from sqlmodel import Session, select
from app.db_operations.auth import engine
from app.models.announcement import Announcement, AnnouncementStatusType



def expire_announcements_loop():
    while True:
        try:
            now = datetime.now(timezone.utc)

            with Session(engine) as session:
                stmt = select(Announcement).where(
                    Announcement.status == AnnouncementStatusType.active,
                    Announcement.expires_at <= now
                )

                results = session.exec(stmt).all()

                for ann in results:
                    ann.status = AnnouncementStatusType.expired

                if results:
                    session.commit()
                    print(f"Expired {len(results)} announcements")

        except Exception as e:
            print(f"[Expiry Worker Error] {e}")

        # run every 30–60 seconds
        time.sleep(30)
