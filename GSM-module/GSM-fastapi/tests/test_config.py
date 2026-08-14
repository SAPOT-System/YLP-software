import os
from pathlib import Path
import subprocess
import sys

import pytest

from config import bounded_integer_env


def test_bounded_integer_env_uses_default_when_missing(monkeypatch):
    monkeypatch.delenv("TEST_QUEUE_SIZE", raising=False)

    assert bounded_integer_env("TEST_QUEUE_SIZE", 10, 20) == 10


@pytest.mark.parametrize("value", ["0", "-1", "", "ten", "21"])
def test_bounded_integer_env_rejects_invalid_values(monkeypatch, value):
    monkeypatch.setenv("TEST_QUEUE_SIZE", value)

    with pytest.raises(RuntimeError, match="TEST_QUEUE_SIZE.*between 1 and 20"):
        bounded_integer_env("TEST_QUEUE_SIZE", 10, 20)


@pytest.mark.parametrize("value", ["1", "4", "20"])
def test_bounded_integer_env_accepts_value_in_range(monkeypatch, value):
    monkeypatch.setenv("TEST_QUEUE_SIZE", value)

    assert bounded_integer_env("TEST_QUEUE_SIZE", 10, 20) == int(value)


def test_config_rejects_missing_gsm_secret(tmp_path):
    env = os.environ.copy()
    env["DB_PATH"] = "sqlite:///test.db"
    env.pop("GSM_SECRET", None)
    env["PYTHONPATH"] = str(Path(__file__).resolve().parents[1])

    result = subprocess.run(
        [sys.executable, "-c", "import config"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "Environment variable 'GSM_SECRET' is not set." in result.stderr
