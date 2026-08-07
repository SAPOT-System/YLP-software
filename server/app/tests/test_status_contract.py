"""Drift guard for the schema queried by deploy/scripts/collect-status.py."""
from app.db_operations.connection_manager import _PRESENCE_KEY
from app.models.activity import ActivityLog
from app.models.message import Message


def test_presence_key_matches_collector_literal():
    assert _PRESENCE_KEY == "ws:online_users"


def test_activity_log_table_and_columns_match_collector_query():
    assert ActivityLog.__tablename__ == "activity_logs"
    assert {"created_at", "metadata_json"} <= set(ActivityLog.__table__.columns.keys())


def test_activity_created_at_is_datetime():
    assert ActivityLog.__table__.columns["created_at"].type.python_type.__name__ == "datetime"


def test_message_created_at_is_epoch_milliseconds():
    assert Message.__tablename__ == "message"
    assert Message.__table__.columns["created_at"].type.python_type is int
