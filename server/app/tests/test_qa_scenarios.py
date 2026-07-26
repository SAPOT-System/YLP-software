"""Unit coverage for app/db_operations/qa_scenarios.py (GH #271, #272)."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlmodel import Session, select

from app.db_operations import qa_scenarios
from app.models.admin import Admin
from app.models.announcement import Announcement
from app.models.banned_user import BannedUser
from app.models.call import Call
from app.models.guest import Guest
from app.models.location import UserLocation
from app.models.login_attempt import LoginAttempt
from app.models.message import Message
from app.models.rescuer import Rescuer
from app.models.users import User


def test_build_baseline_matches_seed_db_shape(session: Session):
    summary = qa_scenarios.build_baseline(session)

    assert summary["users"] == len(session.exec(select(User)).all()) - 1  # minus admin
    assert summary["admin"] == "admin"
    admin_user = session.exec(select(User).where(User.username == "admin")).first()
    assert session.exec(select(Admin).where(Admin.user_id == admin_user.id)).first()
    assert summary["conversations"] > 0


def test_build_baseline_is_idempotent(session: Session):
    first = qa_scenarios.build_baseline(session)
    second = qa_scenarios.build_baseline(session)

    assert first == second
    # No duplicate admin rows created on re-run.
    admin_user = session.exec(select(User).where(User.username == "admin")).first()
    assert len(session.exec(select(Admin).where(Admin.user_id == admin_user.id)).all()) == 1


def test_build_roles_creates_one_of_each_role(session: Session):
    result = qa_scenarios.build_roles(session)

    rescuer_user = session.exec(select(User).where(User.username == "qa_rescuer")).first()
    admin_user = session.exec(select(User).where(User.username == "qa_admin")).first()
    guest_user = session.exec(select(User).where(User.username == "qa_guest")).first()

    assert session.exec(select(Rescuer).where(Rescuer.user_id == rescuer_user.id)).first()
    assert session.exec(select(Admin).where(Admin.user_id == admin_user.id)).first()
    assert session.exec(select(Guest).where(Guest.user_id == guest_user.id)).first()
    assert result["user"] == "qa_baseline"
    assert result["peer"] == "qa_baseline_b"


def test_build_empty_user_has_no_messages(session: Session):
    qa_scenarios.build_empty(session)

    user = session.exec(select(User).where(User.username == "qa_empty")).first()
    assert user is not None
    assert session.exec(select(Message).where(Message.sender_id == user.id)).all() == []


def test_build_banned_creates_future_ban(session: Session):
    qa_scenarios.build_banned(session)

    user = session.exec(select(User).where(User.username == "qa_banned")).first()
    banned = session.exec(select(BannedUser).where(BannedUser.user_id == user.id)).first()
    assert banned is not None
    # SQLite round-trips datetimes as naive, so compare naive-to-naive.
    assert banned.until.replace(tzinfo=None) > datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=365)


def test_build_locked_out_sets_attempt_count_and_lock(session: Session):
    qa_scenarios.build_locked_out(session)

    user = session.exec(select(User).where(User.username == "qa_locked")).first()
    attempt = session.exec(select(LoginAttempt).where(LoginAttempt.user_id == user.id)).first()
    assert attempt.attempt_count == 5
    assert attempt.locked_until.replace(tzinfo=None) > datetime.now(timezone.utc).replace(tzinfo=None)


def test_build_announcements_covers_priority_and_audience_matrix(session: Session):
    qa_scenarios.build_announcements(session)

    rows = session.exec(select(Announcement)).all()
    assert len(rows) == 18  # 2 statuses x 3 priorities x 3 audiences
    statuses = {row.status.value for row in rows}
    assert statuses == {"active", "expired"}


def test_build_gps_track_creates_route_points(session: Session):
    result = qa_scenarios.build_gps_track(session)

    user = session.exec(select(User).where(User.username == "qa_gps")).first()
    points = session.exec(select(UserLocation).where(UserLocation.user_id == user.id)).all()
    assert len(points) == result["points"] > 0


def test_build_calls_creates_all_three_statuses(session: Session):
    qa_scenarios.build_calls(session)

    calls = session.exec(select(Call)).all()
    statuses = {c.status.value for c in calls}
    assert {"completed", "missed", "rejected"} <= statuses


def test_apply_scenario_unknown_name_raises_key_error(session: Session):
    with pytest.raises(KeyError):
        qa_scenarios.apply_scenario(session, "does-not-exist")


def test_reset_database_wipes_and_reseeds_baseline(session: Session):
    qa_scenarios.build_banned(session)
    assert session.exec(select(BannedUser)).first() is not None

    summary = qa_scenarios.reset_database(session)

    assert summary["reseeded"] == "baseline"
    # The banned-scenario row is gone after a hard reset.
    assert session.exec(select(BannedUser)).first() is None
    assert session.exec(select(User).where(User.username == "admin")).first() is not None
