# Tileserver Deployment

The SAPOT tileserver serves offline map tiles to the mobile app. It runs `maptiler/tileserver-gl` in Docker, serving a pre-downloaded Philippines OSM MBTiles file.

---

## Prerequisites

- Docker installed on the host
- MBTiles file at `tileserver/osm-2020-02-10-v3.11_asia_philippines.mbtiles`

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
  --mbtiles osm-2020-02-10-v3.11_asia_philippines.mbtiles
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

The committed MBTiles file covers the Philippines (OSM 2020-02-10, v3.11). To update tiles:

1. Download a newer MBTiles from a source such as Protomaps or OpenMapTiles.
2. Place it in the `tileserver/` directory.
3. Update the `--mbtiles` argument in `deploy-tiling-server-detached.sh`.

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
