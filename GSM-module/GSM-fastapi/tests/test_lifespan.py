import asyncio
import queue

import api


def test_lifespan_reconciles_pending_messages_before_starting_worker(monkeypatch):
    events = []

    class FakeWorker:
        def __init__(self, *_args):
            events.append("worker_created")
            self.incoming_queue = queue.Queue()

        def start(self):
            events.append("worker_started")

        def stop(self):
            events.append("worker_stopped")

    monkeypatch.setattr(api.database, "init", lambda _path: events.append("db_ready"))
    monkeypatch.setattr(
        api.database,
        "fail_orphaned_pending_messages",
        lambda: events.append("pending_reconciled") or 2,
    )
    monkeypatch.setattr(api, "SerialWorker", FakeWorker)

    async def run_lifespan():
        async with api.lifespan(api.app):
            assert events == [
                "db_ready",
                "pending_reconciled",
                "worker_created",
                "worker_started",
            ]

    asyncio.run(run_lifespan())

    assert events[-1] == "worker_stopped"
