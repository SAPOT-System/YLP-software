# CLAUDE.md — tileserver

Instructions for Claude Code working in `tileserver/` — the offline map tile server backing SAPOT's GPS map features. See root `../CLAUDE.md` for repo-wide rules.

## Project Overview

Runs `maptiler/tileserver-gl` in Docker to serve pre-downloaded OpenStreetMap tiles (`.mbtiles`) for the GPS map in `mobile-app/` and `admin-frontend/` (both use `maplibre-gl` as the tile client). No application source code here — only deploy scripts and setup docs.

## Architecture

Docker image `maptiler/tileserver-gl`, bind-mounting this directory (which must contain an `.mbtiles` file — not committed to git) to `/data` inside the container, listening on `127.0.0.1:8080` (not exposed to the LAN directly). Deployed on the same host as the SAPOT server (`server/`); Nginx (`server/nginx.conf` bare-metal, `docker/nginx.docker.conf` for Compose) reverse-proxies `/tiles/` to it over the same TLS cert/port (443) as the API. Clients point `maplibre-gl` at `https://<server-host>/tiles/styles/basic-preview/{z}/{x}/{y}.png` — see `mobile-app/sapot-mobile-app/config/runtime.ts`'s `getTileServerUrl()` and `docs/deployment/tileserver.md` for the full routing detail.

## Directory Guide

- `deploy-tiling-server.sh` — foreground/interactive run (`docker run -it`), for local development.
- `deploy-tiling-server-detached.sh` — background/production run: force-removes any existing `tileserver` container first, then starts a fresh named container with a hardcoded `.mbtiles` filename and host path.
- `download-script.sh` — fetches the `.mbtiles` data file via `curl` from a Google Drive link.
- `documentation.org` — setup instructions, the `.mbtiles` download link, and an example tile-consumer HTML snippet.
- `.gitignore` — excludes `*.mbtiles` (the data file is not committed; see Common Pitfalls).

## Key Concepts

- The `.mbtiles` file is the entire dataset — everything else in this directory is just the serving mechanism. Without it, the container starts but serves no tiles.
- No source code, no build — "modifying this project" almost always means changing the deploy scripts, not application logic.

## Development Conventions

- Any new data file added here should be checked against `.gitignore` before committing — this directory is meant to hold large binary tile data that should not enter git history.

## Common Pitfalls

- `deploy-tiling-server-detached.sh` hardcodes both the absolute host path (`/home/sapot/YLP-software/tileserver`) and the `.mbtiles` filename (`osm-2020-02-10-v3.11_asia_philippines.mbtiles`) — it is not portable across machines/usernames without editing it first.
- A fresh checkout has no map data — `.mbtiles` files are gitignored. Run `download-script.sh` (or follow the Google Drive link in `documentation.org`) before expecting tiles to serve.
- The tile endpoint must be a literal tile URL (`.../{z}/{x}/{y}.png`), not the TileServer GL `#` viewer URL — `documentation.org`'s example flags this explicitly as a common mistake.

## When Modifying This Project

- Changing the `.mbtiles` filename requires updating `deploy-tiling-server-detached.sh` (hardcoded) to match — the foreground script (`deploy-tiling-server.sh`) doesn't hardcode a filename since it doesn't pass `--mbtiles` explicitly.
- Changing the exposed port or data path requires updating both deploy scripts, `server/nginx.conf` / `docker/nginx.docker.conf`'s `/tiles/` proxy target, and the tile endpoint URLs `mobile-app`/`admin-frontend` clients use — this is a cross-component change (see root `CLAUDE.md`).
- `deploy-tiling-server-detached.sh` binds to `127.0.0.1:8080` intentionally — the container is only reachable through the Nginx TLS proxy, not directly on the LAN. Don't revert this to `0.0.0.0`/`:8080` without updating the client URL scheme back to a direct port too.
