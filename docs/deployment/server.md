# Server Deployment

The SAPOT server is a FastAPI application run by Gunicorn behind an Nginx reverse proxy.

---

## Development

```bash
cd server/
bash runserver.sh
```

`runserver.sh` starts Gunicorn with Uvicorn workers binding on `127.0.0.1:8000`. Nginx proxies external traffic to it.

**Nix development environment:**
```bash
cd server/
nix develop    # installs Python deps via flake.nix
```

---

## Run with Docker

A `docker compose` stack (`server/docker-compose.yml`) gives a turnkey dev/test
environment — MariaDB, Redis, the API, and an Nginx TLS terminator — without
installing MariaDB/Redis locally or trusting the fail-fast env-var checks to
dummy shell exports.

```bash
cd server/
cp .env.docker.example .env    # edit placeholder secrets before anything but local dev
docker compose up --build
```

This starts, in dependency order (via healthchecks): `db` (MariaDB) → `redis`
→ `certgen` (one-shot self-signed cert generation into a shared `certs`
volume) → `api` (Gunicorn/Uvicorn, internal-only) → `nginx` (TLS termination,
reverse-proxies to `api`, publishes `443`/`80`). `create_db_and_tables()`
still runs at API startup, so a fresh `db` volume just works — no manual
schema step.

`docker-compose.override.yml` is auto-loaded alongside the base file for
local dev: it bind-mounts `app/` for live edits and runs a single reloading
`uvicorn` process instead of the 5-worker Gunicorn command the `Dockerfile`
uses by default. Omit it for a prod-parity run: `docker compose -f
docker-compose.yml up --build`.

Reach the API through Nginx's self-signed cert:
```bash
curl -k https://localhost/  # -k: cert is self-signed, not CA-trusted
```

**Tests** run in-container against the same image, with no live DB/Redis
needed (the suite uses in-memory SQLite — see `app/tests/conftest.py`):
```bash
docker compose run --rm api pytest
```

**Cert-pinning caveat:** the cert `certgen` generates (`docker/gen-certs.sh`)
is self-signed and regenerated per fresh `certs` volume — it will **not**
match a mobile build with `server_cert.pem` already pinned to a different
cert. Only useful for local API/server testing, not for testing against a
pinned mobile build without also updating its pinned cert.

---

## Production setup

1. Place TLS certificates at `/home/sapot/certs/server.crt` and `server.key`.

2. Install and configure Nginx:
   ```bash
   sudo cp server/nginx.conf /etc/nginx/sites-available/ylp
   sudo ln -s /etc/nginx/sites-available/ylp /etc/nginx/sites-enabled/ylp
   sudo nginx -t && sudo systemctl reload nginx
   ```

3. Configure environment variables (see [environment-config.md](environment-config.md)).

4. Enable and start the systemd service:
   ```bash
   sudo systemctl enable server-main-api
   sudo systemctl start server-main-api
   ```

---

## First run

On first start, `create_db_and_tables()` creates all MariaDB tables automatically. MariaDB and Redis must be running before the server starts.

---

## Nginx routing summary

| Path | Behaviour |
|---|---|
| `/ws/` | WebSocket proxy; no read timeout (86400 s) |
| `/static/` | Filesystem; 30-day cache |
| `/` | Standard proxy; 135 s read timeout |

Port 80 redirects to HTTPS (301). TLS 1.2/1.3, cipher `HIGH:!aNULL:!MD5`.

---

## Background threads

Two daemon threads start at server startup:
- `collect_metrics_loop` — polls MikroTik router for telemetry
- `expire_announcements_loop` — marks expired announcements

---

> **TODO (human input required):** Document Gunicorn worker count, timeout settings, and exact `runserver.sh` flags used in production.
