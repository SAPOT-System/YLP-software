# AGENTS.md — deployment-scripts

systemd unit files for running SAPOT's services in production. See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

Three unit files, no build/package tooling: `server-main-api.service` (runs `server/runserver.sh`), `server-GSM-api.service` (runs `GSM-module/GSM-fastapi/run-api.sh`), `tileserver.service` (runs `tileserver/deploy-tiling-server-detached.sh`). All are configured to run as a `sapot` user from `/home/sapot/YLP-software/...` on the production host. These files are **reference/deployment artifacts** — they aren't installed or reloaded by anything in this repo; changes here only take effect once manually copied to the production host's `/etc/systemd/system/` and `systemctl daemon-reload` + restart is run there.

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

Nothing generated; these are the source files. But be aware editing them here has **no effect on the running production services** until someone deploys the change manually — don't imply otherwise in a PR description.

## Common Pitfalls

- Assuming a change here is "live" once merged — it isn't; it requires a manual deploy step on the production host.
- Renaming/moving `runserver.sh`, `run-api.sh`, or `deploy-tiling-server-detached.sh` without updating the matching `ExecStart` line here.

## Validation Checklist

- [ ] `ExecStart` paths still match the actual location of the scripts they invoke
- [ ] Unit file syntax checked (`systemd-analyze verify`, if available) if the file's structure changed
- [ ] PR description notes that a manual production deploy step is required for the change to take effect
