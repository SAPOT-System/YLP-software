# Monitoring and Logging

---

## Mobile app — Sentry

The mobile app integrates Sentry via `@sentry/react-native/expo` (configured in `app.config.ts`):

- **Sentry project:** `sapot-mobile-app`
- **Organization:** `adriele-matthew-tosino`
- **Sentry URL:** `https://sentry.io/`

Sentry captures uncaught JS exceptions and native crashes. Release tracking is tied to the EAS build profile and version.

### Mobile logging scopes

The app uses a scope-based logger (`features/shared/core/utils/logger.ts`). Control which scopes emit output via:

```bash
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,sync
```

Omitting the variable enables all scopes. Each log entry is also written to a daily rotating log file on-device; retrieve the path via `getLogFilePath()`.

---

## Server — application logs

The FastAPI server configures Python's standard `logging` module at startup (`server/app/main.py`). Log output goes to stdout/stderr, captured by systemd journal.

View live logs:

```bash
sudo journalctl -u server-main-api -f
```

> **TODO (human input required):** Confirm whether JSON structured logging or rotating file logging is enabled, and document the log level configuration.

---

## Server — router metrics collection

A background thread (`collect_metrics_loop`) polls the MikroTik router for telemetry and writes to the `routerhealth` and `interfacetraffic` MariaDB tables (see [tables.md](../database/tables.md)). The admin frontend reads these tables via the `/admin/router-*` endpoints (see [mikrotik-telemetry.md](../api/mikrotik-telemetry.md)).

No external monitoring agent is required — data is stored in the existing database.

---

## Server — announcement expiry

A second background thread (`expire_announcements_loop`) periodically marks announcements whose `expires_at` has passed by setting `is_expired = True`. This runs entirely in-process; no external scheduler is needed.

---

## GSM module logs

The GSM module logs to `GSM-module/GSM-fastapi/sapot.log`. Rotate or clear this file periodically in production.

---

## Health checks

The server exposes an unauthenticated liveness endpoint:

```bash
curl -k https://localhost/
# {"state": "running"}
```

`GET /version` is also unauthenticated and additionally confirms the deployed build (`{"version": "<server-version>"}`, see [VERSIONING.md](../../VERSIONING.md)). Neither endpoint touches the database — a `200` only confirms the FastAPI process and Nginx/Gunicorn are up, not that MariaDB is reachable. For a DB-inclusive check, use an authenticated endpoint like `/auth/exists?email=probe@example.com` (200/404 both indicate the stack including the DB is reachable; a 5xx or timeout does not).

---

## Uptime monitoring

No uptime monitor ships with the server today — this section documents the recommended setup, consistent with the LAN-first design ([ADR 0005](../adr/0005-lan-first-design.md)): the incident-site deployment cannot assume internet access, so the primary monitor must work fully offline, with an internet-facing option layered on top when available.

**LAN / offline deployments (primary):** a local cron job (or systemd timer) polling `GET /` and alerting on failure — no external service required:

```bash
# /etc/cron.d/sapot-uptime — every minute, log failures
* * * * * root curl -sf -k https://localhost/ >/dev/null || logger -t sapot-uptime "server unreachable"
```

Route `sapot-uptime` log lines to whatever the on-site team already watches (e.g. `journalctl -t sapot-uptime`, or forward to a Prometheus `node_exporter` textfile collector if Prometheus is already part of the deployment).

**Internet-facing deployments (optional):** if the server is additionally reachable from the internet (not the default LAN-first case), point an external service such as [UptimeRobot](https://uptimerobot.com/) at `GET /` on the public endpoint for off-site alerting.

**Sentry:** the mobile app has Sentry configured (see above); the server does **not** — `sentry-sdk` is listed in `server/app/requirements.txt` but no `sentry_sdk.init(...)` call exists in `server/app/main.py`. Server-side error alerting currently depends on `journalctl`/log monitoring only.
