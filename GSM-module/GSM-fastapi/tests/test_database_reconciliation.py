import database


def test_fail_orphaned_pending_messages_marks_only_pending_rows(tmp_path):
    database.init(f"sqlite:///{tmp_path / 'gsm.db'}")
    pending_id = database.log_message(
        direction="OUT",
        from_number="API",
        to_number="+639171234567",
        body="pending message",
    )
    received_id = database.log_message(
        direction="IN",
        from_number="+639171234568",
        to_number="SERVER",
        body="received message",
        status="received",
    )

    assert database.fail_orphaned_pending_messages() == 1

    messages = {
        message["id"]: message
        for message in database.get_messages(limit=10)["messages"]
    }
    assert messages[pending_id]["status"] == "failed"
    assert messages[pending_id]["failure_reason"] == "SERVICE_CRASHED"
    assert messages[received_id]["status"] == "received"
    assert messages[received_id]["failure_reason"] is None
    assert database.fail_orphaned_pending_messages() == 0
