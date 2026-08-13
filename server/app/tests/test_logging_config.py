import logging
from logging.handlers import RotatingFileHandler

from app.logging_config import configure_activity_logging


def test_uses_log_dir_env_var(tmp_path, monkeypatch):
    monkeypatch.setenv("SAPOT_LOG_DIR", str(tmp_path / "mounted"))
    resolved = configure_activity_logging(logging.getLogger("test.activity.env"))
    assert resolved == str(tmp_path / "mounted")
    assert (tmp_path / "mounted").is_dir()


def test_attaches_stream_and_two_rotating_handlers(tmp_path, monkeypatch):
    monkeypatch.setenv("SAPOT_LOG_DIR", str(tmp_path))
    logger = logging.getLogger("test.activity.stream")
    configure_activity_logging(logger)
    assert sum(isinstance(h, RotatingFileHandler) for h in logger.handlers) == 2
    assert any(type(h) is logging.StreamHandler for h in logger.handlers)


def test_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setenv("SAPOT_LOG_DIR", str(tmp_path))
    logger = logging.getLogger("test.activity.idempotent")
    configure_activity_logging(logger)
    configure_activity_logging(logger)
    assert len(logger.handlers) == 3
