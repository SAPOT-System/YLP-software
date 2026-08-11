import pytest

from config import positive_integer_env


def test_positive_integer_env_uses_default_when_missing(monkeypatch):
    monkeypatch.delenv("TEST_QUEUE_SIZE", raising=False)

    assert positive_integer_env("TEST_QUEUE_SIZE", 10) == 10


@pytest.mark.parametrize("value", ["0", "-1", "", "ten"])
def test_positive_integer_env_rejects_invalid_values(monkeypatch, value):
    monkeypatch.setenv("TEST_QUEUE_SIZE", value)

    with pytest.raises(RuntimeError, match="TEST_QUEUE_SIZE.*integer"):
        positive_integer_env("TEST_QUEUE_SIZE", 10)


def test_positive_integer_env_accepts_positive_value(monkeypatch):
    monkeypatch.setenv("TEST_QUEUE_SIZE", "4")

    assert positive_integer_env("TEST_QUEUE_SIZE", 10) == 4
