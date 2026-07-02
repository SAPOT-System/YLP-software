import os
from slowapi import Limiter
from slowapi.util import get_remote_address

# Redis-backed storage shares rate-limit counters across all Gunicorn workers.
# Falls back to in-memory (per-process) if Redis is unavailable — acceptable
# for tests and single-worker dev mode, not production.
_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

try:
    limiter = Limiter(key_func=get_remote_address, storage_uri=_REDIS_URL)
except Exception:
    print("no redis")
    limiter = Limiter(key_func=get_remote_address)
