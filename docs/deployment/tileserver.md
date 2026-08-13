# Tileserver Deployment

The SAPOT tileserver serves offline map tiles to the mobile app. It runs `maptiler/tileserver-gl` in Docker, serving a regional OSM MBTiles crop (currently Batangas).

---

## Prerequisites

- Docker installed on the host
- MBTiles file at `tileserver/osm-batangas.mbtiles` — the regional crop actually served (see [MBTiles file](#mbtiles-file) below for how it's produced)

---

## Starting the tileserver

Use the provided deploy script:

```bash
bash tileserver/deploy-tiling-server-detached.sh
```

This script:
1. Removes any existing `tileserver` container (`docker rm -f tileserver`)
2. Starts a fresh container:

```bash
docker run --name tileserver \
  -p 127.0.0.1:8080:8080 \
  -v /home/sapot/YLP-software/tileserver:/data \
  maptiler/tileserver-gl \
  --mbtiles osm-batangas.mbtiles
```

The tile server listens on `127.0.0.1:8080` only — it is not reachable directly from the LAN. Nginx (the same reverse proxy in front of the SAPOT API, see `../../server/nginx.conf`) proxies `/tiles/` to it, terminating TLS with the server's existing cert. Tile requests from the mobile app and admin frontend go to `https://<server-host>/tiles/...` — see `getTileServerUrl()` in `mobile-app/sapot-mobile-app/config/runtime.ts`.

### Docker Compose (dev/test alternative)

The root `docker-compose.yml` (see [docker-setup.md](../getting-started/docker-setup.md))
includes a `tileserver` service using the same image, volume mount, and `--mbtiles` argument as the
deploy script above, expressed as a compose service instead of a standalone `docker run`. Prefer the
standalone scripts on this page for the production host; use the compose service when bringing up the
full stack for local dev.

---

## MBTiles file

`.mbtiles` files are gitignored. The production file is the reviewed
`map/v1.0.0` GitHub Release asset, `osm-batangas.mbtiles`. Its exact SHA-256,
size, bounds, zoom range, and MBTiles metadata are pinned in
`tileserver/map-artifact.json`.

```bash
tileserver/download-script.sh
```

The downloader rejects draft or mutable releases, duplicate or invalid assets, and an
invalid local cache. It writes downloads to a temporary file and replaces the cache only
after the shared validator succeeds. A connected build host downloads the map before
building the bundle. The disconnected deployment host receives the same bytes inside
the bundle and never downloads or crops map data.

`crop-mbtiles.py` remains a developer-only preparation tool for a future map release.
Changed map bytes require a new immutable `map/vX.Y.Z` release and a matching contract
update, rather than a release-time crop.

To change the deployment region, prepare and validate a new artifact with the developer-only crop tool, publish it under a new immutable `map/vX.Y.Z` tag, and update the contract plus the hardcoded filename in **both** `deploy-tiling-server-detached.sh` and `docker-compose.yml`'s `tileserver.command` — plus the matching `REGION_MAX_BOUNDS`/`REGION_MIN_ZOOM` client constants in `admin-frontend/sapot-admin/ui/components/MapLibre.tsx` and `mobile-app/sapot-mobile-app/app/(drawer)/(tabs)/map.tsx`. See `tileserver/CLAUDE.md` for the zoom-floor requirement.

---

## Systemd integration

To auto-start at boot, create `/etc/systemd/system/tileserver.service`:

```ini
[Unit]
Description=SAPOT Tileserver
After=docker.service
Requires=docker.service

[Service]
ExecStart=/home/sapot/YLP-software/tileserver/deploy-tiling-server-detached.sh
ExecStop=/usr/bin/docker stop tileserver
Restart=always
User=sapot

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable tileserver
sudo systemctl start tileserver
```

---

## TLS / reverse proxy

Tile requests are proxied through the same Nginx instance and TLS cert as the SAPOT API server (see `../architecture/component-map.md#nginx-routing`), not exposed on a separate port. This means:

- No separate certificate to generate or pin — the mobile app's existing pinned server cert covers `/tiles/` too, since it's the same TLS endpoint.
- `deploy-tiling-server-detached.sh` binds tileserver-gl to `127.0.0.1:8080`; do not change this to `0.0.0.0` without also removing the direct-access assumption from client code.
- Requires the tileserver container/service to run on the same host as the API server and Nginx — see `../architecture/component-map.md`.
