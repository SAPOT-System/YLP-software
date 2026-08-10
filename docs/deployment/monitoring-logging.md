# Monitoring and Logging

## Mobile app — Sentry

The mobile app integrates Sentry via `@sentry/react-native/expo`. It captures uncaught JS exceptions and native crashes. Server-side Sentry alerts are not configured.

## Server — application logs

The FastAPI `app` logger has JSON and text `RotatingFileHandler`s (1 MB plus three backups each), and a `StreamHandler` visible through `docker logs api`. `SAPOT_LOG_DIR` selects the directory; it defaults to `../logs` for local runs and is `/home/app/logs` in Docker. That directory is mounted from `/opt/sapot/shared/logs/api`, as are Gunicorn's access and error logs.

```bash
docker compose -p sapot -f /opt/sapot/releases/current/compose/docker-compose.yml logs -f api
tail -f /opt/sapot/shared/logs/api/activity.log
```

Scheduled database backup events are also in journald:

- `sudo journalctl -u sapot-db-backup.service --since '7 days ago' --no-pager` records each scheduled backup. `[PASS]` confirms the dump and any off-host copy. `[WARN]` means a lifecycle operation held the lock or the off-host drive was absent, leaving the on-host dump intact. `[ERROR]` means no backup was produced.

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

The GSM module writes `$GSM_LOG_DIR/sapot.log` through a rotating handler (1 MB plus three backups) and stdout. Docker sets `GSM_LOG_DIR=/var/log/sapot`, mounted from `/opt/sapot/shared/logs/gsm`; an unset value preserves the local working-directory behavior.

`deploy/scripts/lib/retention.sh` removes files under `shared/logs` older than `SAPOT_LOG_RETENTION_DAYS` (30 by default) during install and upgrade.

## Health checks — `/status`

Open `https://<server-ip>/status` on the LAN. It needs no login and stays available when the API is down because nginx serves a static page and a status snapshot directly.

`status-collector` runs every 60 seconds outside the API process. It probes API, admin, TileServer, and GSM over the compose network, queries Redis and MariaDB directly, and writes `shared/status/health.json` atomically. It uses no Docker socket. Its read-only `sapot_status` database user has SELECT only on `message`, `activity_logs`, and `sms_log`.

| Page item | Meaning |
|---|---|
| Overall | `healthy` means every check passes; `degraded` means API is up but another service is not; `failed` means API is not responding; `unknown` means the collector cycle itself failed. |
| Stale banner | The snapshot is over 180 seconds old. Treat it as a stopped collector, even if the last overall state was healthy. |
| `—` counter | That individual query failed. It does not make the health section fail. |
| Release file integrity | Checksum result recorded during the last install or upgrade. It is provenance, not a live health check. |

The page deliberately excludes IP addresses, user identifiers, internal hostnames, and error messages. For deeper host and bundle checks, run:

```bash
/opt/sapot/releases/current/scripts/doctor.sh
/opt/sapot/releases/current/scripts/doctor.sh --json
```

No cloud uptime monitor is used. This deployment is LAN-first and does not rely on internet access; `/status` and `doctor.sh` are the monitoring surface.
