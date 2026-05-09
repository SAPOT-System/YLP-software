#!/bin/sh

echo "##################### running the tile server ###################"

sudo docker run -it \
  --name tileserver \
  -p 8080:8080 \
  -v "$(pwd)":/data \
  -e ALLOW_CORS=true \
  maptiler/tileserver-gl
