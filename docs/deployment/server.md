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

A `docker compose` stack (root `docker-compose.yml`) gives a turnkey dev/test
environment — MariaDB, Redis, the API, an Nginx TLS terminator, plus the admin
dashboard, tileserver, and SMS gateway — without installing MariaDB/Redis
locally or trusting the fail-fast env-var checks to dummy shell exports. See
[docker-setup.md](../getting-started/docker-setup.md) for the
full walkthrough. All commands below run from the **repo root**.

```bash
cp server/.env.example server/.env    # edit placeholder secrets before anything but local dev
docker/up.sh up --build
```

On Windows, use the PowerShell equivalent instead (works in plain
PowerShell — no WSL or Git Bash required):
```powershell
copy server\.env.example server\.env
docker\up.ps1 up --build
```

This starts, in dependency order (via healthchecks): `db` (MariaDB) → `redis`
→ `certgen` (one-shot cert generation into `server/certs/`, a bind-mounted
directory inside the repo — not a Docker-managed volume, so the generated
`server.crt`/`server.key` are directly browsable on the host, gitignored)
→ `api` (Gunicorn/Uvicorn, internal-only) → `nginx` (TLS termination,
reverse-proxies to `api`, publishes `443`/`80`). Schema comes from Alembic
(`alembic upgrade head`), not from application startup, so a fresh `db`
volume needs that migration step to have run before the API serves traffic.

`docker-compose.override.yml` is auto-loaded alongside the base file for
local dev: it bind-mounts `app/` for live edits and runs a single reloading
`uvicorn` process instead of the 5-worker Gunicorn command the `Dockerfile`
uses by default. Omit it for a prod-parity run: `docker/up.sh -f
docker-compose.yml up --build` (`docker\up.ps1 -f docker-compose.yml up
--build` on Windows).

**`docker/up.sh`** (`docker/up.ps1` on Windows) is a thin wrapper around
`docker compose` — use it instead of calling `docker compose` directly for
any command. It auto-detects this machine's LAN IP (`docker/detect-ip.sh` /
`detect-ip.ps1`, via a UDP-connect trick, no elevated privileges needed)
and adds it to `CERT_SAN` before invoking compose, so a client (mobile app,
admin frontend) connecting over the LAN IP rather than `localhost` still
gets a cert whose SAN matches. Set `CERT_SAN` yourself in the shell
(`CERT_SAN=... docker/up.sh up`, or `$env:CERT_SAN = "..."` on Windows) to
override auto-detection — the wrapper won't touch it if it's already set.
A `CERT_SAN` set only in `.env` is not visible to the wrapper (compose
reads `.env` itself), so auto-detection wins unless you set it in the
shell/environment first. If you've already brought the stack up once with
the old default SAN, `certgen` won't regenerate the cert (`gen-certs.sh`
skips if one already exists) — delete `server/certs/` (or its contents)
first to force regeneration.

Reach the API through Nginx's self-signed cert:
```bash
curl -k https://localhost/  # -k: cert is self-signed, not CA-trusted
curl -k https://<lan-ip>/   # from another device on the LAN
```

**Tests** run in-container against the same image, with no live DB/Redis
needed (the suite uses in-memory SQLite — see `app/tests/conftest.py`):
```bash
docker/up.sh run --rm api pytest        # docker\up.ps1 run --rm api pytest on Windows
```

**Testing against a CA-pinned mobile build:** if your mobile app build pins
a CA (see `runbooks.md`, "Offline CA Setup"), a self-signed cert from
`certgen` won't be trusted — drop the shared dev CA's `server_ca.pem` +
`server_ca.key` into `server/dev-ca/` (see `dev-ca/README.md`) and
`certgen` issues a CA-signed leaf for your machine's LAN IP automatically
instead. Dev-only — never reuse that CA for a production deployment.

**CA-pinning caveat:** the cert `certgen` generates (`docker/gen-certs.sh`) is regenerated
whenever `server/certs/` is empty. The mobile app pins a **CA**, not a leaf
(`server_ca.pem`, see [mobile-eas.md](mobile-eas.md#tls-ca-pinning)), so:

- **No dev CA present** → `certgen` emits a *self-signed* cert, which chains to nothing the
  app trusts. A CA-pinning build will reject it. Useful for local API/server testing only.
- **Dev CA present** (`server/dev-ca/`) → `certgen` issues a leaf signed by that CA, which a
  mobile build pinning the *same* CA accepts — and you can regenerate the leaf as often as you
  like without touching the app.

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

On first start, the schema is created by Alembic, not by the application. `server/runserver.sh` runs `alembic upgrade head` before launching gunicorn; if you start the app another way, run it yourself from `server/` with `DATABASE_URL` set. MariaDB and Redis must be running before the server starts.

If you are pointing the server at a database created *before* Alembic was adopted, do **not** run `upgrade` on it — see the [one-time cutover](../database/migrations.md#one-time-cutover-for-existing-databases).

---

## Nginx routing summary

| Path | Behaviour |
|---|---|
| `/ws/` | WebSocket proxy; no read timeout (86400 s) |
| `/static/` | Filesystem; 30-day cache |
| `/` | Standard proxy; 155 s read timeout |

Port 80 redirects to HTTPS (301). TLS 1.2/1.3, cipher `HIGH:!aNULL:!MD5`.

---

## Background threads

Two daemon threads start at server startup:
- `collect_metrics_loop` — polls MikroTik router for telemetry
- `expire_announcements_loop` — marks expired announcements

---

> **TODO (human input required):** Document Gunicorn worker count, timeout settings, and exact `runserver.sh` flags used in production.
