import importlib

import pytest

import app.env as env_module


def test_environment_defaults_to_production(monkeypatch):
    with monkeypatch.context() as patch:
        patch.delenv("ENVIRONMENT", raising=False)
        env = importlib.reload(env_module)
        assert env.ENVIRONMENT is env.Env.production
        assert env.IS_QA_ENABLED is False
    importlib.reload(env_module)


@pytest.mark.parametrize(
    ("value", "expected_qa_enabled"),
    [("development", True), ("staging", True), ("production", False)],
)
def test_environment_accepts_known_values(monkeypatch, value, expected_qa_enabled):
    with monkeypatch.context() as patch:
        patch.setenv("ENVIRONMENT", value)
        env = importlib.reload(env_module)
        assert env.ENVIRONMENT.value == value
        assert env.IS_QA_ENABLED is expected_qa_enabled
    importlib.reload(env_module)


def test_environment_rejects_unknown_values(monkeypatch):
    with monkeypatch.context() as patch:
        patch.setenv("ENVIRONMENT", "Development")
        with pytest.raises(ValueError, match="Development"):
            importlib.reload(env_module)
    importlib.reload(env_module)
