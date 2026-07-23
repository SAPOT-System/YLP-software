# Maintenance

Routine, scheduled upkeep for a running SAPOT deployment — as opposed to [runbooks.md](runbooks.md) (respond to a specific event) and [incident-response.md](incident-response.md) (process during an active problem). Nothing here is automated today; treat this as a checklist for whoever operates the deployment.

---

## Recurring schedule

| Task | Frequency | Reference |
|---|---|---|
| Database backup (`mysqldump`) | Daily during an active field deployment; weekly for a standing/dev environment | [runbooks.md#backup-and-restore-mariadb](runbooks.md#backup-and-restore-mariadb) |
| Confirm backups are reachable off-host | Same cadence as the backup itself | [runbooks.md#backup-and-restore-mariadb](runbooks.md#backup-and-restore-mariadb) — a backup that lives only on the machine it protects against doesn't survive hardware failure |
| Check disk space on the server host | Weekly | `df -h` — MariaDB, backups, and journald logs all grow unbounded without rotation |
| Review GSM module log size | Weekly | `GSM-module/GSM-fastapi/sapot.log` has no automatic rotation configured — see [monitoring-logging.md](monitoring-logging.md#gsm-module-logs); truncate or `logrotate` it manually |
| Check TLS server-leaf cert expiry | Monthly, and always before a new field deployment | `openssl x509 -in /home/sapot/certs/server.crt -noout -dates` — leaf is issued for ~825 days ([runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf](runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf)) |
| Check offline root CA expiry | Yearly | CA is issued for 10 years ([runbooks.md#offline-ca-setup](runbooks.md#offline-ca-setup)) — rotating the CA (not just the leaf) requires rebuilding and redistributing the mobile app |
| Review dependency updates | Before each release (see [VERSIONING.md](../../VERSIONING.md)), not ad hoc mid-deployment | See [Dependency updates](#dependency-updates) below |
| Confirm systemd units are enabled (survive reboot) | After any host maintenance/reboot | `systemctl is-enabled server-main-api server-GSM-api tileserver mariadb redis nginx` |

---

## Dependency updates

Each component owns its own dependency file — there is no repo-wide update mechanism (see [CLAUDE.md](../../CLAUDE.md), "Repository Shape"):

| Component | File | Notes |
|---|---|---|
| `server/` | `requirements.txt` | No migration tooling ([ADR 0002](../adr/0002-no-server-migration-tooling.md)) — a dependency bump that changes SQLModel/DB-driver behavior still needs the manual DDL discipline in [runbooks.md](runbooks.md#manual-db-ddl-application-no-alembic) if it touches schema |
| `mobile-app/sapot-mobile-app/` | `package.json` | Expo SDK bumps need `expo-doctor` (`pnpm run testAll` includes it) — do not hand-edit `pnpm-lock.yaml` |
| `admin-frontend/sapot-admin/` | `package.json` | `pnpm run lint && pnpm run build` after any bump — no test script exists in this component |
| `GSM-module/GSM-fastapi/` | `requirements.txt` | No automated tests — verify manually per [gsm-module-setup.md](../getting-started/gsm-module-setup.md) after any bump |
| Nix flakes (per component) | `flake.lock` | Never hand-edit; only `nix flake update` should touch it |

Never bundle a dependency bump with an unrelated feature change — if it breaks something, you want to be able to tell which caused it.

---

## Log housekeeping

- **Server:** stdout/stderr goes to the systemd journal ([monitoring-logging.md](monitoring-logging.md#server--application-logs)). `journald` rotates by its own configured size/time limits (`/etc/systemd/journald.conf`) — confirm those limits are set on the deployment host; the default can otherwise consume significant disk on a long-running field deployment.
- **GSM module:** `sapot.log` has no rotation configured in-repo. Either wire it into `logrotate` or truncate it manually on the weekly cadence above.
- **Mobile app:** daily rotating log file on-device (`getLogFilePath()`, see [monitoring-logging.md](monitoring-logging.md#mobile-app--sentry)) — no server-side action needed; this is per-device storage, not something an operator cleans up remotely.

---

## Database housekeeping

- `expire_announcements_loop` and `collect_metrics_loop` (see [monitoring-logging.md](monitoring-logging.md)) run continuously in-process — no manual sweep needed for announcement expiry or router telemetry.
- `routerhealth` and `interfacetraffic` tables accumulate telemetry rows indefinitely (see [tables.md](../database/tables.md)) — there is no built-in retention/pruning job. On a long-running standing deployment, periodically check row counts and prune old rows manually if disk becomes a concern; on a short field deployment this is unlikely to matter.

> **TODO (human input required):** Decide a retention window (if any) for `routerhealth`/`interfacetraffic` on standing deployments, and whether a cron-based pruning job should be added.

---

## Pre-deployment checklist

Before standing up SAPOT at a new incident site (fresh hardware, not a restore — see [runbooks.md's disaster recovery](runbooks.md#disaster-recovery--server-hardware-fails-at-incident-site) for that case):

1. Confirm the offline root CA is still valid (see schedule above) and re-issue a server leaf if needed.
2. Confirm all required secrets are set per [environment-config.md](environment-config.md) and [SECURITY.md](../../SECURITY.md) — the server fails fast at import if `DATABASE_URL`, `JWT_SECRET_KEY`, or `CORS_ALLOWED_ORIGINS` are missing.
3. Confirm `ENVIRONMENT` is **not** set to `development` in the field deployment's env — that gate exists specifically to keep `/testing/*` endpoints out of production (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md#testing-endpoints-return-404-in-dev)).
4. Take a baseline backup immediately after first successful start, before real data accumulates only on this host.
