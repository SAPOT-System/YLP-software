# CLAUDE.md — tileserver

Instructions for Claude Code working in `tileserver/` — the offline map tile server backing SAPOT's GPS map features. See root `../CLAUDE.md` for repo-wide rules.

## Project Overview

Runs `maptiler/tileserver-gl` in Docker to serve pre-downloaded OpenStreetMap tiles (`.mbtiles`) for the GPS map in `mobile-app/` and `admin-frontend/` (both use `maplibre-gl` as the tile client). No application source code here — only deploy scripts and setup docs.

## Architecture

Docker image `maptiler/tileserver-gl`, bind-mounting this directory (which must contain an `.mbtiles` file — not committed to git) to `/data` inside the container, listening on `127.0.0.1:8080` (not exposed to the LAN directly). Deployed on the same host as the SAPOT server (`server/`); Nginx (`server/nginx.conf` bare-metal, `docker/nginx.docker.conf` for Compose) reverse-proxies `/tiles/` to it over the same TLS cert/port (443) as the API. Clients point `maplibre-gl` at `https://<server-host>/tiles/styles/basic-preview/{z}/{x}/{y}.png` — see `mobile-app/sapot-mobile-app/config/runtime.ts`'s `getTileServerUrl()` and `docs/deployment/tileserver.md` for the full routing detail.

## Directory Guide

- `deploy-tiling-server.sh` — foreground/interactive run (`docker run -it`), for local development.
- `deploy-tiling-server-detached.sh` — background/production run: force-removes any existing `tileserver` container first, then starts a fresh named container with a hardcoded `.mbtiles` filename and host path.
- `download-script.sh` - fetches the full Philippines `.mbtiles`, verifies it
  against `osm-source.sha256`, then crops it to the deployment region. It takes
  an optional region argument (default `batangas`) and `--cleanup-source` for
  ephemeral release runners.
- `crop-mbtiles.py` — cuts the 432 MB national extract down to the ~27 MB regional file that is actually served. Deployment uses `--no-overview --min-zoom 9`, keeping only z9-14 inside the region bbox; without `--no-overview` it instead keeps a nationwide low-zoom overview plus regional detail. Opens the source read-only and builds the output fresh, so peak disk usage is the size of the output, not 3x the input.
- `documentation.org` — setup instructions, the `.mbtiles` download link, and an example tile-consumer HTML snippet.
- `.gitignore` — excludes `*.mbtiles` (the data file is not committed; see Common Pitfalls).

## Key Concepts

- The `.mbtiles` file is the entire dataset — everything else in this directory is just the serving mechanism. Without it, the container starts but serves no tiles.
- Two `.mbtiles` files exist in a full setup: the national source (`osm-2020-02-10-v3.11_asia_philippines.mbtiles`, download artifact, not served) and the regional crop (`osm-batangas.mbtiles`, what the deploy scripts and `docker-compose.yml` point at). Both are gitignored.
- `bounds` metadata tracks the mode: `--no-overview` writes the region bbox (clients then never request outside it), while the overview mode keeps the source extent (narrowing it there would suppress the nationwide low-zoom levels that mode exists to preserve).
- **The stored zoom floor must be one below the clients' `minZoom`.** tileserver-gl renders a raster tile at zoom Z from vector tiles at Z-1, so a file whose lowest stored zoom is 10 serves z10 vector tiles fine yet renders a blank PNG at z10. Deployment stores z9 and the clients floor at z10.
- The region box is duplicated as `REGION_MAX_BOUNDS`/`REGION_MIN_ZOOM` in `admin-frontend/sapot-admin/ui/components/MapLibre.tsx` and `mobile-app/sapot-mobile-app/app/(drawer)/(tabs)/map.tsx`. Re-cropping for a different province means editing all three.
- Tiles are squares, so the data cannot be clipped to a provincial outline — low-zoom tiles always carry some neighbouring area. `maxBounds` on the clients, not the crop, is what keeps users inside the deployment area.
- No source code, no build — "modifying this project" almost always means changing the deploy scripts, not application logic.

## Development Conventions

- Any new data file added here should be checked against `.gitignore` before committing — this directory is meant to hold large binary tile data that should not enter git history.

## Common Pitfalls

- `deploy-tiling-server-detached.sh` hardcodes both the absolute host path (`/home/sapot/YLP-software/tileserver`) and the `.mbtiles` filename (`osm-batangas.mbtiles`) — it is not portable across machines/usernames without editing it first.
- A fresh checkout has no map data — `.mbtiles` files are gitignored. Run `download-script.sh` (or follow the Google Drive link in `documentation.org`) before expecting tiles to serve.
- The tile endpoint must be a literal tile URL (`.../{z}/{x}/{y}.png`), not the TileServer GL `#` viewer URL — `documentation.org`'s example flags this explicitly as a common mistake.
- Tile rows are stored TMS (bottom-up, per the file's `scheme=tms` metadata) but the HTTP API serves XYZ (top-down). Mixing the two silently returns the wrong tile or a blank one — `crop-mbtiles.py`'s `tile_ranges()` does the flip, and any hand-written SQL against `map`/`tiles` must too.
- Outside the cropped region, tile requests return HTTP 204 (vector) or a blank 1833-byte PNG (raster). That is the designed degradation, not a broken tileserver, and the blank PNG is deliberate: a 404 would trip the admin's `tiles-unavailable` banner (`MapLibre.tsx`'s `error` handler).

## When Modifying This Project

- Changing the `.mbtiles` filename requires updating `deploy-tiling-server-detached.sh` **and** `docker-compose.yml`'s `tileserver.command` (both hardcode `osm-batangas.mbtiles`) — the foreground script (`deploy-tiling-server.sh`) doesn't hardcode a filename since it doesn't pass `--mbtiles` explicitly.
- Changing the deployment region means re-running `./crop-mbtiles.py --region <name>` against the national source and repointing those two hardcoded filenames. Adding a region means adding a bbox to `REGIONS` in `crop-mbtiles.py`.
- Changing the exposed port or data path requires updating both deploy scripts, `server/nginx.conf` / `docker/nginx.docker.conf`'s `/tiles/` proxy target, and the tile endpoint URLs `mobile-app`/`admin-frontend` clients use — this is a cross-component change (see root `CLAUDE.md`).
- `deploy-tiling-server-detached.sh` binds to `127.0.0.1:8080` intentionally — the container is only reachable through the Nginx TLS proxy, not directly on the LAN. Don't revert this to `0.0.0.0`/`:8080` without updating the client URL scheme back to a direct port too.
