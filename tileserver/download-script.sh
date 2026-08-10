#!/bin/sh
# Fetch the full Philippines extract, then crop it to the deployment region.
#
# Only the cropped file is served (see deploy-tiling-server-detached.sh and
# docker-compose.yml). The full extract is kept afterwards so a different
# region can be cut later without re-downloading 432 MB -- delete it manually
# if the host is short on disk.
set -e

REGION="${1:-batangas}"
SOURCE="osm-2020-02-10-v3.11_asia_philippines.mbtiles"

if [ ! -f "$SOURCE" ]; then
  echo "### downloading full Philippines extract (432 MB) ###"
  curl -L -o "$SOURCE" \
    "https://drive.usercontent.google.com/download?id=1UVakmRkrHaz2J1cgCIbkAHsHDW9SYwLq&export=download&confirm=t&uuid=decf843a-461b-43c5-8c08-11a3789ab93b"
else
  echo "### $SOURCE already present, skipping download ###"
fi

echo "### cropping to region: $REGION ###"
# --no-overview: this deployment shows only its own province, so the
# nationwide low-zoom levels are dropped too. --min-zoom 9 is one below the
# clients' minZoom of 10, because tileserver-gl renders a raster tile at zoom
# Z from vector tiles at Z-1 -- without z9 present, z10 renders blank.
./crop-mbtiles.py --region "$REGION" --no-overview --min-zoom 9

echo
echo "Serving file is osm-$REGION.mbtiles."
echo "The $SOURCE source (432 MB) is no longer needed at runtime -- remove it"
echo "if disk is tight, but you will need to re-download it to cut a new region."
