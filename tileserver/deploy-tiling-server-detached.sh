#!/bin/bash
echo "##################### running the tile server ###################"

# 1. Force remove any container matching the name before creating a new one
/usr/bin/docker rm -f tileserver 2>/dev/null

# 2. Start a fresh container cleanly
/usr/bin/docker run --name tileserver \
  -p 8080:8080 \
  -v /home/sapot/YLP-software/tileserver:/data \
  maptiler/tileserver-gl --mbtiles osm-2020-02-10-v3.11_asia_philippines.mbtiles
