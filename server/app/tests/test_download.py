"""
GET /download/download-apk must 404 (not crash) when the APK artifact isn't
present. Found via the Postman baseline suite: FileResponse raises unhandled
when the file is missing, turning a routine "not built yet" state into a 500.
"""

from app.api import download as download_module


def test_download_apk_404s_when_apk_missing(client, tmp_path, monkeypatch):
    missing_path = tmp_path / "sapot.apk"
    monkeypatch.setattr(download_module, "APK_PATH", missing_path)

    r = client.get("/download/download-apk")

    assert r.status_code == 404
    assert r.json()["detail"] == "APK not found"


def test_download_apk_serves_file_when_present(client, tmp_path, monkeypatch):
    apk_path = tmp_path / "sapot.apk"
    apk_path.write_bytes(b"fake-apk-bytes")
    monkeypatch.setattr(download_module, "APK_PATH", apk_path)

    r = client.get("/download/download-apk")

    assert r.status_code == 200
    assert r.content == b"fake-apk-bytes"
