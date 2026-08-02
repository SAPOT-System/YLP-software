"""Regression coverage for concurrent user-presence updates."""
from uuid import uuid4

from app.db_operations.activity import _get_user_activity_for_update


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
