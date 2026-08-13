# AGENTS.md — deployment-scripts

systemd unit files for running SAPOT's services in production. See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

Seven unit files, no build/package tooling: `server-main-api.service` (runs `server/runserver.sh`), `server-GSM-api.service` (runs `GSM-module/GSM-fastapi/run-api.sh`), `tileserver.service` (runs `tileserver/deploy-tiling-server-detached.sh`), and backup plus restore-verification service/timer pairs. The verification service restores only into disposable MariaDB storage and must never receive production credentials. Bundle builds ship exactly those four database-maintenance units.

The three service units are **reference/deployment artifacts** — nothing in this repo installs or reloads them; changes take effect only once someone copies them to the production host's `/etc/systemd/system/` and runs `systemctl daemon-reload` plus a restart there. **The two backup units are different**: `scripts/build-bundle.sh` copies them into every bundle's `systemd/` directory, and `deploy/scripts/install.sh` installs them, provisions the `sapot` account they run as, and enables the timer; `upgrade.sh` and `rollback.sh` refresh the files without enabling anything. Editing them here therefore changes what the next bundle installs on a docker-bundle host, while a bare-metal host still needs the manual copy. See [runbooks.md](../docs/deployment/runbooks.md#backup-automated).

## Build

None.

## Test

None — these can't be meaningfully tested outside the actual production host. Validate by checking the unit file syntax (`systemd-analyze verify <file>` if available) rather than claiming a live-tested change.

## Lint / Format

None configured.

## Framework Expectations

- Each unit's `ExecStart` path must stay in sync with the actual script it points to (`server/runserver.sh`, `GSM-module/GSM-fastapi/run-api.sh`, `tileserver/deploy-tiling-server-detached.sh`) — if you rename or move one of those scripts, update the corresponding unit file in the same change.
- These files hardcode the production path `/home/sapot/YLP-software/...` — that's intentional for this specific deployment, not a bug.

## Do Not Edit Manually

Nothing generated; these are the source files. But be aware editing a *service* unit here has **no effect on the running production services** until someone deploys the change manually — don't imply otherwise in a PR description. The backup units reach docker-bundle hosts through the next bundle build and install, which is still not "live on merge".

## Common Pitfalls

- Assuming a change here is "live" once merged — it isn't; the three service units require a manual deploy step, and the backup units require a bundle rebuild plus install/upgrade on the target.
- Renaming a backup unit without updating `scripts/build-bundle.sh`, which copies them by name — a renamed unit silently stops shipping, and the old one stays behind in `/etc/systemd/system/` on hosts that already have it.
- Renaming/moving `runserver.sh`, `run-api.sh`, or `deploy-tiling-server-detached.sh` without updating the matching `ExecStart` line here.

## Validation Checklist

- [ ] `ExecStart` paths still match the actual location of the scripts they invoke
- [ ] `sapot-db-backup.service` selects the bundle or bare-metal `backup-db.sh` path
- [ ] a renamed or added backup unit is reflected in `scripts/build-bundle.sh`'s copy line
- [ ] Unit file syntax checked (`systemd-analyze verify`, if available) if the file's structure changed
- [ ] PR description notes that a manual production deploy step is required for the change to take effect
