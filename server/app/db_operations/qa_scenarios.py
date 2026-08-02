"""QA scenario builders shared by the `seed_db.py` CLI and the `/testing/*`
HTTP surface (`app/api/testing.py`). One function per catalog entry in
`SCENARIOS`; each takes the open `Session` and returns a small summary dict
for the CLI/HTTP caller to report back.

Moved out of `scripts/seed_db.py` (see that file's docstring for why) so the
scenario logic has exactly one implementation instead of drifting between a
CLI-only seeder and any HTTP seed endpoint.
"""
from datetime import datetime, timedelta, timezone
from typing import Callable, NamedTuple

from sqlmodel import Session, select

from app.db_operations.auth import get_password_hash, verify_password
from app.models.admin import Admin
from app.models.announcement import (
    Announcement,
    AnnouncementStatusType,
    AudienceType,
    PriorityType,
)
from app.models.banned_user import BannedUser
from app.models.call import Call, CallType, StatusType as CallStatus
from app.models.call_participant import CallParticipant
from app.models.conversation import Conversation, ConversationParticipant, ConversationType
from app.models.guest import Guest
from app.models.location import UserLocation
from app.models.login_attempt import LoginAttempt
from app.models.message import Message, MessageType
from app.models.rescuer import Rescuer
from app.models.users import User

# Imported lazily inside seed_users() rather than at module scope: app.tests/__init__.py
# imports app.main (for its own TestClient fixtures), and this module is now imported
# from app.main's own import chain (via app.api.testing) — a top-level import here would
# be circular.


def to_ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


# assets.py's "test" user ships with a phone number ("+638788667676") that fails the
# app's own PhoneStr pattern (^\+639\d{9}$ — must start +639). It passes silently through
# SQLModel table-model construction (no validation there) but 500s any endpoint that
# builds a strict Pydantic model from it, e.g. GET /user-utils/current-user-info via
# UserInfo. assets.py can't be fixed directly — test_admin_me.py asserts on that exact
# value — so the correction is applied only to this seeded dev-database copy.
TEST_USER_PHONE_OVERRIDE = "+639178866767"

# All seeded accounts share this password rather than the per-character passwords in
# assets.py, so testers only need to remember one. Fixture accounts minted through
# /testing/login-as never need it (tokens are issued directly), but it still lets a
# tester log in through the normal form if they want to.
COMMON_PASSWORD = "Password321"


def seed_users(session: Session) -> list[User]:
    from app.tests.assets import sample_users

    common_hash = get_password_hash(COMMON_PASSWORD)
    users = []
    for data in sample_users.values():
        phone_number = (
            TEST_USER_PHONE_OVERRIDE if data["username"] == "test" else data["phone_number"]
        )

        existing = session.exec(select(User).where(User.username == data["username"])).first()
        if existing:
            if existing.phone_number != phone_number:
                existing.phone_number = phone_number
                session.add(existing)
            if not verify_password(COMMON_PASSWORD, existing.hashed_password):
                existing.hashed_password = common_hash
                session.add(existing)
            users.append(existing)
            continue
        user = User(
            id=data["id"],
            username=data["username"],
            first_name=data["first_name"],
            last_name=data["last_name"],
            phone_number=phone_number,
            email=data["email"],
            hashed_password=common_hash,
            email_verified=True,
        )
        session.add(user)
        users.append(user)
    session.commit()
    for user in users:
        session.refresh(user)
    return users


ADMIN_ACCOUNT = {
    "username": "admin",
    "first_name": "Admin",
    "last_name": "User",
    "phone_number": "+639300000001",
    # "sapot.local" is a special-use TLD (RFC 6762); EmailStr rejects it, which
    # 500'd every UserPublic response for this fixture (e.g. /testing/login-as/admin).
    # "example.com" is RFC 2606-reserved for exactly this use, unlike a real
    # registrable domain nobody here owns.
    "email": "admin@example.com",
}


def get_or_create_user(
    session: Session,
    username: str,
    *,
    first_name: str = "QA",
    last_name: str = "Fixture",
    phone_number: str | None = None,
    email: str | None = None,
    password: str = COMMON_PASSWORD,
) -> User:
    """Idempotent single-user fixture helper for the non-`baseline` scenarios."""
    user = session.exec(select(User).where(User.username == username)).first()
    if user:
        return user
    user = User(
        username=username,
        first_name=first_name,
        last_name=last_name,
        phone_number=phone_number,
        email=email,
        hashed_password=get_password_hash(password),
        email_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def seed_admin(session: Session) -> User:
    user = session.exec(select(User).where(User.username == ADMIN_ACCOUNT["username"])).first()
    if not user:
        user = User(
            username=ADMIN_ACCOUNT["username"],
            first_name=ADMIN_ACCOUNT["first_name"],
            last_name=ADMIN_ACCOUNT["last_name"],
            phone_number=ADMIN_ACCOUNT["phone_number"],
            email=ADMIN_ACCOUNT["email"],
            hashed_password=get_password_hash(COMMON_PASSWORD),
            email_verified=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    elif not verify_password(COMMON_PASSWORD, user.hashed_password):
        user.hashed_password = get_password_hash(COMMON_PASSWORD)
        session.add(user)
        session.commit()
        session.refresh(user)

    has_admin_role = session.exec(select(Admin).where(Admin.user_id == user.id)).first()
    if not has_admin_role:
        session.add(Admin(user_id=user.id))
        session.commit()

    return user


def seed_conversation(session: Session, user_a: User, user_b: User) -> Conversation:
    title = f"{user_a.username} & {user_b.username}"
    existing = session.exec(select(Conversation).where(Conversation.title == title)).first()
    if existing:
        return existing

    conversation = Conversation(title=title, conversation_type=ConversationType.direct)
    session.add(conversation)
    session.flush()

    for user in (user_a, user_b):
        session.add(ConversationParticipant(conversation_id=conversation.id, user_id=user.id))

    session.commit()
    session.refresh(conversation)
    return conversation


def seed_messages(session: Session, conversation: Conversation, user_a: User, user_b: User) -> None:
    existing = session.exec(select(Message).where(Message.conversation_id == conversation.id)).first()
    if existing:
        return

    now = datetime.now(timezone.utc)
    exchange = [
        (user_a, "Hey, you copy?", 120),
        (user_b, "Copy. Go ahead.", 115),
        (user_a, "Status update: en route to checkpoint.", 90),
        (user_b, "Acknowledged, ETA?", 85),
        (user_a, "About 15 mikes out.", 80),
    ]
    for sender, content, minutes_ago in exchange:
        ts = to_ms(now - timedelta(minutes=minutes_ago))
        session.add(
            Message(
                content=content,
                message_type=MessageType.text,
                conversation_id=conversation.id,
                sender_id=sender.id,
                created_at=ts,
                updated_at=ts,
            )
        )
    session.commit()


# Matches MESSAGE_PAGE_SIZE in mobile-app/.../features/chat/components/message-list.tsx
# (100) and the server's /public-chat default limit — 200 guarantees at least two pages
# so pagination (loading more, scroll-back cursor) is actually exercised locally.
BULK_MESSAGE_TARGET = 200

# Design R3's `large` scenario target — big enough to exercise list virtualization and
# the WatermelonDB sync cursor, not just plain pagination.
LARGE_MESSAGE_TARGET = 2000
LARGE_PEER_COUNT = 50
LARGE_LOCATION_POINT_COUNT = 500


def seed_bulk_messages(
    session: Session, conversation: Conversation, user_a: User, user_b: User, target: int = BULK_MESSAGE_TARGET
) -> None:
    existing = session.exec(select(Message).where(Message.conversation_id == conversation.id)).all()
    to_create = target - len(existing)
    if to_create <= 0:
        return

    now = datetime.now(timezone.utc)
    participants = (user_a, user_b)
    start_index = len(existing)
    for n in range(to_create):
        sender = participants[n % 2]
        minutes_ago = (to_create - n) * 3
        ts = to_ms(now - timedelta(minutes=minutes_ago))
        session.add(
            Message(
                content=f"Pagination stress-test message #{start_index + n + 1}",
                message_type=MessageType.text,
                conversation_id=conversation.id,
                sender_id=sender.id,
                created_at=ts,
                updated_at=ts,
            )
        )
    session.commit()


def seed_call(
    session: Session,
    conversation: Conversation,
    initiator: User,
    status: CallStatus = CallStatus.completed,
) -> None:
    existing = session.exec(
        select(Call).where(Call.conversation_id == conversation.id, Call.status == status)
    ).first()
    if existing:
        return

    now = datetime.now(timezone.utc)
    start = to_ms(now - timedelta(minutes=60))
    # Call.end_time is declared NOT NULL despite its `| None` type hint (see
    # app/models/call.py) — a missed/rejected call still needs a real value.
    end = start + 5 * 60 * 1000 if status == CallStatus.completed else start
    call = Call(
        call_type=CallType.audio,
        status=status,
        conversation_id=conversation.id,
        initiator_id=initiator.id,
        start_time=start,
        end_time=end,
        updated_at=start,
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    session.add(CallParticipant(call_id=call.id, user_id=initiator.id, joined_at=start))
    session.commit()


# ---------------------------------------------------------------------------
# Scenario builders (design doc §R3)
# ---------------------------------------------------------------------------

def build_baseline(session: Session) -> dict:
    """Matches the historical `seed_db.py` CLI output exactly (issue #271)."""
    users = seed_users(session)
    admin_user = seed_admin(session)

    pairs = 0
    for i in range(0, len(users) - 1, 2):
        user_a, user_b = users[i], users[i + 1]
        conversation = seed_conversation(session, user_a, user_b)
        if i == 0:
            # First pair gets the pagination stress-test volume; the rest stay light.
            seed_bulk_messages(session, conversation, user_a, user_b)
        else:
            seed_messages(session, conversation, user_a, user_b)
        seed_call(session, conversation, user_a)
        pairs += 1

    return {
        "users": len(users),
        "admin": admin_user.username,
        "admin_email": admin_user.email,
        "conversations": pairs,
    }


def build_roles(session: Session) -> dict:
    user = get_or_create_user(session, "qa_baseline", phone_number="+639300000101")
    peer = get_or_create_user(session, "qa_baseline_b", phone_number="+639300000102")

    rescuer_user = get_or_create_user(session, "qa_rescuer", phone_number="+639300000103")
    if not session.exec(select(Rescuer).where(Rescuer.user_id == rescuer_user.id)).first():
        session.add(Rescuer(user_id=rescuer_user.id))
        session.commit()

    admin_user = get_or_create_user(session, "qa_admin", phone_number="+639300000104")
    if not session.exec(select(Admin).where(Admin.user_id == admin_user.id)).first():
        session.add(Admin(user_id=admin_user.id))
        session.commit()

    guest_user = get_or_create_user(session, "qa_guest", phone_number="+639300000105")
    if not session.exec(select(Guest).where(Guest.user_id == guest_user.id)).first():
        session.add(Guest(user_id=guest_user.id))
        session.commit()

    return {
        "user": user.username,
        "peer": peer.username,
        "rescuer": rescuer_user.username,
        "admin": admin_user.username,
        "guest": guest_user.username,
    }


def build_empty(session: Session) -> dict:
    user = get_or_create_user(session, "qa_empty", phone_number="+639300000201")
    return {"user": user.username}


def build_large(session: Session) -> dict:
    peers = [
        get_or_create_user(session, f"qa_large_peer_{n:02d}", phone_number=f"+63930010{n:04d}")
        for n in range(LARGE_PEER_COUNT)
    ]
    anchor = get_or_create_user(session, "qa_large", phone_number="+639300000301")

    conversation = seed_conversation(session, anchor, peers[0])
    seed_bulk_messages(session, conversation, anchor, peers[0], target=LARGE_MESSAGE_TARGET)

    existing_points = session.exec(
        select(UserLocation).where(UserLocation.user_id == anchor.id)
    ).all()
    to_create = LARGE_LOCATION_POINT_COUNT - len(existing_points)
    if to_create > 0:
        now = datetime.now(timezone.utc)
        base_lat, base_lng = 14.5995, 120.9842  # Manila, arbitrary anchor
        for n in range(to_create):
            session.add(
                UserLocation(
                    latitude=base_lat + n * 0.0001,
                    longitude=base_lng + n * 0.0001,
                    timestamp=now - timedelta(minutes=(to_create - n)),
                    user_id=anchor.id,
                )
            )
        session.commit()

    return {
        "peers": len(peers),
        "messages_target": LARGE_MESSAGE_TARGET,
        "location_points": LARGE_LOCATION_POINT_COUNT,
    }


def build_banned(session: Session) -> dict:
    user = get_or_create_user(session, "qa_banned", phone_number="+639300000401")
    existing = session.exec(select(BannedUser).where(BannedUser.user_id == user.id)).first()
    if not existing:
        session.add(BannedUser(user_id=user.id, until=datetime(2099, 1, 1, tzinfo=timezone.utc)))
        session.commit()
    return {"user": user.username, "banned_until": "2099-01-01"}


def build_locked_out(session: Session) -> dict:
    user = get_or_create_user(session, "qa_locked", phone_number="+639300000501")
    device_fingerprint = "qa-locked-out-fixture-device"
    existing = session.exec(
        select(LoginAttempt).where(
            LoginAttempt.user_id == user.id,
            LoginAttempt.device_fingerprint == device_fingerprint,
        )
    ).first()
    now = datetime.now(timezone.utc)
    locked_until = now + timedelta(hours=6)
    if existing:
        existing.attempt_count = 5
        existing.locked_until = locked_until
        existing.last_attempt_at = now
        session.add(existing)
    else:
        session.add(
            LoginAttempt(
                user_id=user.id,
                device_fingerprint=device_fingerprint,
                device_type="mobile",
                attempt_count=5,
                lockout_count=1,
                locked_until=locked_until,
                last_attempt_at=now,
            )
        )
    session.commit()
    return {"user": user.username, "locked_until": locked_until.isoformat()}


_ANNOUNCEMENT_PRIORITIES = (PriorityType.low, PriorityType.normal, PriorityType.high)
_ANNOUNCEMENT_AUDIENCES = (AudienceType.user, AudienceType.rescuer, AudienceType.admin)


def build_announcements(session: Session) -> dict:
    author = seed_admin(session)
    now = datetime.now(timezone.utc)
    created = 0
    for status in (AnnouncementStatusType.active, AnnouncementStatusType.expired):
        for priority in _ANNOUNCEMENT_PRIORITIES:
            for audience in _ANNOUNCEMENT_AUDIENCES:
                title = f"QA {status.value}/{priority.value}/{audience.value}"
                existing = session.exec(
                    select(Announcement).where(Announcement.title == title)
                ).first()
                if existing:
                    continue
                expires_at = now + timedelta(days=7) if status == AnnouncementStatusType.active else now - timedelta(days=1)
                session.add(
                    Announcement(
                        user_id=author.id,
                        title=title,
                        content=f"Generated QA fixture announcement ({title}).",
                        priority=priority,
                        status=status,
                        expires_at=expires_at,
                        target_audience=audience,
                    )
                )
                created += 1
    session.commit()
    return {"created": created, "total": 2 * len(_ANNOUNCEMENT_PRIORITIES) * len(_ANNOUNCEMENT_AUDIENCES)}


def build_gps_track(session: Session) -> dict:
    user = get_or_create_user(session, "qa_gps", phone_number="+639300000601")
    existing_points = session.exec(select(UserLocation).where(UserLocation.user_id == user.id)).all()
    if existing_points:
        return {"user": user.username, "points": len(existing_points)}

    now = datetime.now(timezone.utc)
    # A short walking route so the map/history views have visible movement.
    base_lat, base_lng = 14.5547, 121.0244  # Makati, arbitrary anchor
    point_count = 60
    for n in range(point_count):
        session.add(
            UserLocation(
                latitude=base_lat + n * 0.0005,
                longitude=base_lng + n * 0.0003,
                timestamp=now - timedelta(minutes=(point_count - n)),
                user_id=user.id,
            )
        )
    session.commit()
    return {"user": user.username, "points": point_count}


def build_calls(session: Session) -> dict:
    user_a = get_or_create_user(session, "qa_calls_a", phone_number="+639300000701")
    user_b = get_or_create_user(session, "qa_calls_b", phone_number="+639300000702")
    conversation = seed_conversation(session, user_a, user_b)
    for status in (CallStatus.completed, CallStatus.missed, CallStatus.rejected):
        seed_call(session, conversation, user_a, status=status)
    return {"conversation": conversation.title, "call_statuses": ["completed", "missed", "rejected"]}


class Scenario(NamedTuple):
    description: str
    build: Callable[[Session], dict]


SCENARIOS: dict[str, Scenario] = {
    "baseline": Scenario(
        "9 sample users + admin, direct conversations, a 200+ message pagination "
        "thread, and one call log per conversation.",
        build_baseline,
    ),
    "roles": Scenario(
        "qa_baseline / qa_baseline_b / qa_rescuer / qa_admin / qa_guest fixtures "
        "covering every role-gated UI path.",
        build_roles,
    ),
    "empty": Scenario(
        "qa_empty — a real account with zero conversations, messages, or "
        "announcements, for empty-state screens.",
        build_empty,
    ),
    "large": Scenario(
        f"qa_large + {LARGE_PEER_COUNT} peers, {LARGE_MESSAGE_TARGET} messages, and "
        f"{LARGE_LOCATION_POINT_COUNT} UserLocation points for list perf / sync cursor testing.",
        build_large,
    ),
    "banned": Scenario(
        "qa_banned with a BannedUser row expiring 2099-01-01.",
        build_banned,
    ),
    "locked-out": Scenario(
        "qa_locked with a LoginAttempt row at attempt_count=5, locked_until +6h.",
        build_locked_out,
    ),
    "announcements": Scenario(
        "Active + expired announcements across all 3 priorities x 3 audiences (18 rows).",
        build_announcements,
    ),
    "gps-track": Scenario(
        "qa_gps with a 60-point UserLocation history along a short route.",
        build_gps_track,
    ),
    "calls": Scenario(
        "qa_calls_a/qa_calls_b with completed/missed/rejected Call rows (each with "
        "a CallParticipant row for the initiator) on one conversation.",
        build_calls,
    ),
}


def apply_scenario(session: Session, name: str) -> dict:
    scenario = SCENARIOS.get(name)
    if scenario is None:
        raise KeyError(name)
    return scenario.build(session)


def reset_database(session: Session) -> dict:
    """Drop and recreate every table, then re-seed `baseline` (design R2).

    Derives the engine from the given session's own bind rather than importing the
    module-level `engine` directly, so this respects the same `get_session`
    dependency-override tests use for every other `/testing/*` route.
    """
    from sqlmodel import SQLModel

    bind = session.get_bind()
    SQLModel.metadata.drop_all(bind)
    SQLModel.metadata.create_all(bind)
    # The session's identity map still holds pre-drop objects at their old (now
    # stale) primary keys; expire them so build_baseline's queries hit the fresh
    # tables instead of conflicting with those cached instances.
    session.expire_all()

    summary = build_baseline(session)
    return {"reseeded": "baseline", **summary}
