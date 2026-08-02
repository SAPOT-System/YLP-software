#!/bin/bash
set -eu

echo "##################### running the tile server ###################"

# TileServer GL uses this URL as the base for every generated resource URL.
# Validate it before touching the existing container, so a bad deployment
# configuration cannot take down a working tile server.
if [ -z "${TILESERVER_PUBLIC_URL:-}" ] || ! [[ "$TILESERVER_PUBLIC_URL" =~ ^https://[^[:space:]/]+/tiles/$ ]]; then
  echo "TILESERVER_PUBLIC_URL must be an HTTPS URL ending in /tiles/ (for example, https://server.sapot.lan/tiles/)" >&2
  exit 1
fi

# 1. Force remove any container matching the name before creating a new one
/usr/bin/docker rm -f tileserver 2>/dev/null

# 2. Start a fresh container cleanly
# Bound to localhost only — reachable via nginx (TLS) at /tiles/, not
# directly on the LAN. See ../server/nginx.conf.
/usr/bin/docker run --name tileserver \
  -p 127.0.0.1:8080:8080 \
  -v /home/sapot/YLP-software/tileserver:/data \
  maptiler/tileserver-gl \
  --mbtiles osm-2020-02-10-v3.11_asia_philippines.mbtiles \
  --public_url "$TILESERVER_PUBLIC_URL"
