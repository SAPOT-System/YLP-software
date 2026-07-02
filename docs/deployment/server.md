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
