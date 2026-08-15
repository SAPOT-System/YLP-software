"""Regression coverage for concurrent user-presence updates."""
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from app.db_operations.activity import (
    _get_user_activity_for_update,
    _write_user_activity_sync,
)


class _Result:
    def first(self):
        return None


class _RecordingSession:
    def __init__(self):
        self.statement = None

    def exec(self, statement):
        self.statement = statement
        return _Result()


def test_presence_lookup_locks_the_user_activity_row():
    """HTTP and WebSocket writers must serialize updates for the same user."""
    session = _RecordingSession()

    assert _get_user_activity_for_update(session, uuid4()) is None
    assert session.statement._for_update_arg is not None


def test_activity_write_ignores_missing_user_foreign_key(monkeypatch, capsys):
    class FailingSession:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def exec(self, _):
            return _Result()

        def add(self, _):
            pass

        def commit(self):
            raise IntegrityError("INSERT", {}, Exception("foreign key constraint"))

    monkeypatch.setattr(
        "app.db_operations.activity.Session", lambda _: FailingSession()
    )

    _write_user_activity_sync(uuid4(), "127.0.0.1", "pytest")

    assert capsys.readouterr().out == ""
