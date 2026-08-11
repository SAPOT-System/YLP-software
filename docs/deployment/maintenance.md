# Maintenance

Routine, scheduled upkeep for a running SAPOT deployment, as opposed to [runbooks.md](runbooks.md) (respond to a specific event) and [incident-response.md](incident-response.md) (process during an active problem). Database backup is automated (see [runbooks.md](runbooks.md#backup-automated)); everything else here is a manual checklist for whoever operates the deployment.

---

## Recurring schedule

| Task | Frequency | Reference |
|---|---|---|
| Confirm the backup timer is firing | Weekly | `systemctl list-timers sapot-db-backup.timer` and `journalctl -u sapot-db-backup.service --since '7 days ago'`. Bundle installs enable this timer automatically, and `doctor.sh` reports a `db-backup` row |
| Swap or verify the off-host backup drive | Daily during an active field deployment; weekly for a standing/dev environment | The script copies each dump to `SAPOT_BACKUP_OFFHOST_DIR` but never deletes from it, so capacity is managed by hand. `doctor.sh` reports the off-host copy's age |
| Check disk space on the server host | Weekly | `df -h` — MariaDB and journald logs grow without rotation; database backups are bounded by `SAPOT_BACKUP_RETENTION_DAYS` (default 14, newest 3 always kept) |
| Review GSM module log size | Weekly | `GSM-module/GSM-fastapi/sapot.log` has no automatic rotation configured — see [monitoring-logging.md](monitoring-logging.md#gsm-module-logs); truncate or `logrotate` it manually |
| Check TLS server-leaf cert expiry | Monthly, and always before a new field deployment | `openssl x509 -in <cert> -noout -dates` — leaf is issued for ~825 days. Cert path is `/opt/sapot/shared/certs/server.crt` (docker bundle, where `doctor.sh` checks this for you) or `/home/sapot/certs/server.crt` (bare metal). Rotation: [runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf](runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf) |
| Check offline root CA expiry | Yearly | CA is issued for 10 years ([runbooks.md#offline-ca-setup](runbooks.md#offline-ca-setup)) — rotating the CA (not just the leaf) requires rebuilding and redistributing the mobile app |
| Review dependency updates | Before each release (see [VERSIONING.md](../../VERSIONING.md)), not ad hoc mid-deployment | See [Dependency updates](#dependency-updates) below |
| Confirm systemd units are enabled (survive reboot) | After any host maintenance/reboot | `systemctl is-enabled server-main-api server-GSM-api tileserver mariadb redis nginx` |

---

## Dependency updates

Each component owns its own dependency file — there is no repo-wide update mechanism (see [CLAUDE.md](../../CLAUDE.md), "Repository Shape"):

| Component | File | Notes |
|---|---|---|
| `server/` | `requirements.txt` | Schema is Alembic-managed ([ADR 0007](../adr/0007-alembic-for-server-migrations.md)) — a dependency bump that changes SQLModel/SQLAlchemy/DB-driver behavior can shift what autogenerate emits, so re-run `alembic check` and follow [runbooks.md](runbooks.md#applying-schema-migrations-alembic) if it touches schema. Pin `alembic` itself deliberately. |
| `mobile-app/sapot-mobile-app/` | `package.json` | Expo SDK bumps need `expo-doctor` (`pnpm run testAll` includes it) — do not hand-edit `pnpm-lock.yaml` |
| `admin-frontend/sapot-admin/` | `package.json` | `pnpm run lint && pnpm run build` after any bump — no test script exists in this component |
| `GSM-module/GSM-fastapi/` | `requirements.txt` | No automated tests — verify manually per [gsm-module-setup.md](../getting-started/gsm-module-setup.md) after any bump |
| Nix flakes (per component) | `flake.lock` | Never hand-edit; only `nix flake update` should touch it |

Never bundle a dependency bump with an unrelated feature change — if it breaks something, you want to be able to tell which caused it.

---

## Log housekeeping

- **Server:** stdout/stderr goes to the systemd journal ([monitoring-logging.md](monitoring-logging.md#server--application-logs)). `journald` rotates by its own configured size/time limits (`/etc/systemd/journald.conf`) — confirm those limits are set on the deployment host; the default can otherwise consume significant disk on a long-running field deployment.
- **GSM module:** `sapot.log` has no rotation configured in-repo. Either wire it into `logrotate` or truncate it manually on the weekly cadence above.
- **Database backups:** pruned automatically on each successful run, with a 14-day window and a floor of the three newest. Copies on removable media are never pruned by the script. Each dump is a complete, unencrypted copy of the database, so both the backup directory and the off-host drive need the same protection as the server itself; see [runbooks.md](runbooks.md#protecting-dumps).
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
3. Confirm `ENVIRONMENT` is **not** set to `development` or `staging` in the field deployment's env — those values enable `/testing/*` endpoints (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md#testing-endpoints-return-404-in-development-or-staging)).
4. Confirm `sapot-db-backup.timer` is enabled (a docker-bundle `install.sh` does this for you; bare-metal is a manual step, see [runbooks.md](runbooks.md#backup-automated)) and run `backup-db.sh` once by hand to take a baseline before real data accumulates only on this host.
