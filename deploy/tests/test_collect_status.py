import importlib.util
import json
import pathlib
from datetime import datetime, timezone

import pytest

script = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "collect-status.py"
spec = importlib.util.spec_from_file_location("collect_status", script)
collect_status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collect_status)


def check(name, status): return {"check": name, "status": status, "detail": ""}


def test_overall_statuses():
    assert collect_status.overall_status([check("api", "PASS")]) == "healthy"
    assert collect_status.overall_status([check("api", "PASS"), check("db", "FAIL")]) == "degraded"
    assert collect_status.overall_status([check("api", "FAIL")]) == "failed"
    assert collect_status.overall_status([]) == "unknown"


def test_integrity_is_tolerant_and_does_not_taint_overall(tmp_path):
    assert collect_status.read_integrity(str(tmp_path / "missing")) is None
    (tmp_path / "bad").write_text("{")
    assert collect_status.read_integrity(str(tmp_path / "bad")) is None
    data = collect_status.build_payload([check("api", "PASS")], {}, {"status": "FAIL", "verifiedAt": None}, "x", datetime.now(timezone.utc), 0)
    assert data["overall"] == "healthy"


def test_write_atomic(tmp_path):
    collect_status.write_atomic(str(tmp_path), {"overall": "healthy"})
    assert json.loads((tmp_path / "health.json").read_text())["overall"] == "healthy"
    assert not (tmp_path / collect_status.TEMP_NAME).exists()


def test_closed_port_fails():
    assert collect_status.probe_http("http://127.0.0.1:9", 0.2)[0] is False


def test_run_once_degrades_every_unreachable_dependency(tmp_path):
    config = collect_status.Config(str(tmp_path), "", "", "mysql+pymysql://x:y@127.0.0.1:9/x", "redis://127.0.0.1:9", .2, 60, {"api": "http://127.0.0.1:9", "admin": "http://127.0.0.1:9"})
    data = collect_status.run_once(config)
    assert data["overall"] == "failed"
    assert json.loads((tmp_path / "health.json").read_text()) == data
    assert data["counters"]["diskFreeBytes"] is not None


def test_run_once_writes_unknown_for_unexpected_cycle_error(tmp_path, monkeypatch):
    monkeypatch.setattr(collect_status, "collect_checks", lambda _: (_ for _ in ()).throw(RuntimeError("unexpected")))
    config = collect_status.Config(str(tmp_path), "", "", "x", "x", .2, 60, {"api": "http://127.0.0.1:9"})
    assert collect_status.run_once(config)["overall"] == "unknown"
    assert "unexpected" in (tmp_path / "health.json").read_text()


def test_missing_database_url_fails_fast(monkeypatch):
    monkeypatch.delenv("STATUS_DATABASE_URL", raising=False)
    with pytest.raises(SystemExit): collect_status.config_from_env()
