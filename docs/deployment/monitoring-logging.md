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

Scheduled database backup events are also in journald:

- `sudo journalctl -u sapot-db-backup.service --since '7 days ago' --no-pager` records each scheduled backup. `[PASS]` confirms the dump and any off-host copy. `[WARN]` means a lifecycle operation held the lock or the off-host drive was absent, leaving the on-host dump intact. `[ERROR]` means no backup was produced.
- `sudo journalctl -u sapot-db-backup-verify.service --since '7 days ago' --no-pager` records restore verification. Its state file is `verification-status.json` beside the dumps, and bundle `doctor.sh` exposes it as `db-backup-restore`. Stable reasons include `INVALID_DUMP`, `INSUFFICIENT_SPACE`, `RESTORE_FAILED`, `STRUCTURE_FAILED`, `SCHEMA_INVALID`, and `ROW_COUNT_MISMATCH`; no remote pager is configured.

Nothing watches these entries. A backup that stops running is noticed only when someone reads the journal or runs `doctor.sh`, whose `db-backup` row fails once the newest dump is older than `SAPOT_BACKUP_MAX_AGE_HOURS` (default 36). Since "MariaDB corrupted with no recent backup" is a SEV1 in [incident-response.md](incident-response.md), treat the weekly check in [maintenance.md](maintenance.md#recurring-schedule) as load-bearing rather than routine.

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

No dedicated health-check endpoints are documented. The Nginx proxy (port 443 → Gunicorn :8000) can be used as a liveness check:

```bash
curl -k https://localhost/auth/exists?identifier=probe@example.com
```

A 200 response with `{"exists": true/false}` confirms the stack is reachable.

---

> **TODO (human input required):** Document whether an uptime monitor (e.g. UptimeRobot, Prometheus, or a simple cron ping) is in use, and whether Sentry alerts are configured for the server component.
