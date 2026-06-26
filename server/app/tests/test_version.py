from fastapi.testclient import TestClient
from app.main import app
from app.version import __version__
from app.version_writer import is_valid_version, render_version_module

client = TestClient(app)


def test_version_endpoint_returns_source_version():
    res = client.get("/version")
    assert res.status_code == 200
    assert res.json() == {"version": __version__}


def test_is_valid_version():
    assert is_valid_version("1.2.0")
    assert is_valid_version("1.2.0-rc.1")
    assert not is_valid_version("v1.2.0")
    assert not is_valid_version("1.2")


def test_render_version_module():
    out = render_version_module("1.2.0")
    assert out == '__version__ = "1.2.0"\n'
