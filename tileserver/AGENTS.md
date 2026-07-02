# AGENTS.md — tileserver

Standalone Docker-based map-tile server for SAPOT's offline maps, consumed by both `mobile-app/` and `admin-frontend/`. See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

Not a codebase — just shell scripts that run the `maptiler/tileserver-gl` Docker image against an `.mbtiles` file:
- `deploy-tiling-server.sh` — foreground `docker run`.
- `deploy-tiling-server-detached.sh` — detached (`-d`) `docker run`, for leaving it running.
- `download-script.sh` — fetches the `.mbtiles` file (not committed to the repo).

## Build

None — no compilation, just pulling/running a prebuilt Docker image.

## Test

None. Verification is: run the deploy script, confirm the tile server responds (e.g. `curl` a tile URL or check it in `mobile-app`/`admin-frontend`'s map view).

## Lint / Format

None configured — these are small shell scripts; keep them POSIX-shell-compatible and consistent with the existing two scripts' structure if you add a third.

## Framework Expectations

- The `.mbtiles` file is **not in version control** — scripts assume it's already been downloaded (via `download-script.sh` or manually) to a known local path before running. Don't hardcode a path that doesn't match what `download-script.sh` actually produces without checking.
- `deployment-scripts/tileserver.service` runs `deploy-tiling-server-detached.sh` in production — keep that script's interface (flags, expected file locations) compatible with the systemd unit if you change it.

## Do Not Edit Manually

Nothing generated lives in this directory — there's nothing here that's off-limits beyond not hand-editing the (not-committed) `.mbtiles` data file itself.

## Common Pitfalls

- Running a deploy script without the `.mbtiles` file present locally — it will fail; this is expected, not a bug to "fix" by hardcoding a fallback.
- Changing `deploy-tiling-server-detached.sh`'s invocation without checking `deployment-scripts/tileserver.service`, which depends on it in production.

## Validation Checklist

- [ ] Script still runs successfully against a locally-downloaded `.mbtiles` file
- [ ] `deployment-scripts/tileserver.service` still matches this script's interface if the detached script's flags/behavior changed
- [ ] If Docker/the `.mbtiles` file isn't available to actually test, this limitation is stated explicitly rather than claiming the change was verified
