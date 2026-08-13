#!/usr/bin/env python3
"""Write a LAN-only, static status snapshot without using Docker's API."""
import argparse
import json
import os
import socket
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

PRESENCE_KEY = "ws:online_users"
TEMP_NAME = ".health.json.tmp"
OUTPUT_NAME = "health.json"
DEFAULT_SERVICE_URLS = {"api": "http://api:8000/version", "admin": "http://admin:3000", "tileserver": "http://tileserver:8080", "gsm": "http://gsm-fastapi:8001/health"}


@dataclass
class Config:
    output_dir: str
    cert_path: str
    integrity_path: str
    database_url: str
    redis_url: str
    probe_timeout: float
    interval_seconds: int
    service_urls: dict = field(default_factory=lambda: dict(DEFAULT_SERVICE_URLS))


def config_from_env() -> Config:
    database_url = os.environ.get("STATUS_DATABASE_URL")
    if not database_url:
        raise SystemExit("STATUS_DATABASE_URL is not set; refusing to start")
    output_dir = os.environ.get("STATUS_OUTPUT_DIR", "/status")
    return Config(output_dir, os.environ.get("STATUS_CERT_PATH", "/certs/server.crt"), os.environ.get("STATUS_INTEGRITY_PATH", os.path.join(output_dir, "integrity.json")), database_url, os.environ.get("STATUS_REDIS_URL", "redis://redis:6379"), float(os.environ.get("STATUS_PROBE_TIMEOUT", "5")), int(os.environ.get("STATUS_INTERVAL_SECONDS", "60")))


def probe_http(url: str, timeout: float) -> tuple[bool, str]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            code, body = response.status, response.read(4096)
        return code < 500, f"HTTP {code}|{body.decode('utf-8', 'replace')[:200]}"
    except urllib.error.HTTPError as error:
        return error.code < 500, f"HTTP {error.code}"
    except (urllib.error.URLError, socket.timeout, OSError) as error:
        return False, f"unreachable: {error}"
    except Exception as error:
        return False, f"probe error: {error}"


def collect_checks(config: Config):
    checks, version = [], None
    for name, url in config.service_urls.items():
        ok, detail = probe_http(url, config.probe_timeout)
        if name == "api" and ok:
            try: version = json.loads(detail.split("|", 1)[1]).get("version")
            except Exception: pass
        checks.append({"check": name, "status": "PASS" if ok else "FAIL", "detail": ("reachable" if name in {"admin", "tileserver"} else "responding") if ok else detail.split("|", 1)[0]})
    return checks, version


def count_online_devices(config: Config):
    try:
        import redis
        return int(redis.from_url(config.redis_url, socket_timeout=config.probe_timeout).zcount(PRESENCE_KEY, time.time(), "+inf"))
    except Exception: return None


def query_db_counters(config: Config):
    counters = {"messagesLastHour": None, "mutatingRequestsLastHour": None, "mutatingErrorRatePct": None, "gsmSmsPending": None}
    try:
        from sqlalchemy import create_engine, text
        engine = create_engine(config.database_url, pool_pre_ping=True, connect_args={"connect_timeout": int(config.probe_timeout)})
        with engine.connect() as con:
            try: counters["messagesLastHour"] = con.execute(text("SELECT COUNT(*) FROM message WHERE created_at > :cutoff"), {"cutoff": int(time.time() * 1000) - 3600000}).scalar()
            except Exception: pass
            try:
                row = con.execute(text("SELECT COUNT(*) total, SUM(CASE WHEN JSON_EXTRACT(metadata_json, '$.status_code') >= 500 THEN 1 ELSE 0 END) errors FROM activity_logs WHERE created_at > :cutoff"), {"cutoff": (datetime.now(timezone.utc) - timedelta(hours=1)).replace(tzinfo=None)}).one()
                total, errors = int(row.total or 0), int(row.errors or 0)
                counters["mutatingRequestsLastHour"] = total
                counters["mutatingErrorRatePct"] = round(errors / total * 100, 2) if total else 0.0
            except Exception: pass
            try: counters["gsmSmsPending"] = con.execute(text("SELECT COUNT(*) FROM sms_log WHERE status = 'pending'")).scalar()
            except Exception: pass
    except Exception: pass
    return counters


def disk_free_bytes(path):
    try:
        stat = os.statvfs(path); return int(stat.f_bavail * stat.f_frsize)
    except Exception: return None


def cert_expires_in_days(path):
    try:
        from cryptography import x509
        with open(path, "rb") as f: cert = x509.load_pem_x509_certificate(f.read())
        return int((cert.not_valid_after_utc - datetime.now(timezone.utc)).total_seconds() // 86400)
    except Exception: return None


def read_integrity(path):
    try:
        with open(path, encoding="utf-8") as f: result = json.load(f)
        return {"status": result["status"], "verifiedAt": result.get("verifiedAt")} if isinstance(result, dict) and "status" in result else None
    except Exception: return None


def overall_status(checks):
    if not checks: return "unknown"
    states = {check["check"]: check["status"] for check in checks}
    if states.get("api") != "PASS": return "failed"
    return "degraded" if any(v != "PASS" for v in states.values()) else "healthy"


def build_payload(checks, counters, integrity, version, generated_at, collector_age_seconds):
    return {"generatedAt": generated_at.strftime("%Y-%m-%dT%H:%M:%SZ"), "collectorAgeSeconds": collector_age_seconds, "version": version, "overall": overall_status(checks), "checks": checks, "counters": counters, "integrity": integrity or {"status": "UNKNOWN", "verifiedAt": None}}


def write_atomic(output_dir, payload):
    os.makedirs(output_dir, exist_ok=True)
    temp = os.path.join(output_dir, TEMP_NAME)
    with open(temp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2); f.write("\n"); f.flush(); os.fsync(f.fileno())
    os.replace(temp, os.path.join(output_dir, OUTPUT_NAME))


def run_once(config):
    started = datetime.now(timezone.utc)
    try:
        checks, version = collect_checks(config)
        counters = query_db_counters(config)
        counters.update({"devicesConnected": count_online_devices(config), "diskFreeBytes": disk_free_bytes(config.output_dir), "certExpiresInDays": cert_expires_in_days(config.cert_path)})
        payload = build_payload(checks, counters, read_integrity(config.integrity_path), version, started, int((datetime.now(timezone.utc) - started).total_seconds()))
    except Exception as error:
        payload = {"generatedAt": started.strftime("%Y-%m-%dT%H:%M:%SZ"), "collectorAgeSeconds": 0, "version": None, "overall": "unknown", "reason": f"collector cycle failed: {error}", "checks": [], "counters": {}, "integrity": {"status": "UNKNOWN", "verifiedAt": None}}
    try: write_atomic(config.output_dir, payload)
    except Exception as error: print(f"collect-status: could not write output: {error}", file=sys.stderr, flush=True)
    return payload


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--once", action="store_true"); args = parser.parse_args(); config = config_from_env()
    if args.once: print(json.dumps(run_once(config), indent=2)); return 0
    while True: run_once(config); time.sleep(config.interval_seconds)


if __name__ == "__main__": raise SystemExit(main())
