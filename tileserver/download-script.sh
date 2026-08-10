#!/bin/sh
# Fetch the pinned Philippines extract, verify it, then crop the deployment region.
#
# Only the cropped file is served (see deploy-tiling-server-detached.sh and
# docker-compose.yml). The full extract is kept afterwards so a different
# region can be cut later without re-downloading 432 MB. Pass --cleanup-source
# on an ephemeral CI runner to remove it after a successful crop.
set -e

SCRIPT_DIR=$(cd -P -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

REGION=batangas
CLEANUP_SOURCE=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cleanup-source) CLEANUP_SOURCE=true ;;
    *) REGION=$1 ;;
  esac
  shift
done

SOURCE="osm-2020-02-10-v3.11_asia_philippines.mbtiles"
SOURCE_URL="https://drive.usercontent.google.com/download?id=1UVakmRkrHaz2J1cgCIbkAHsHDW9SYwLq&export=download&confirm=t&uuid=decf843a-461b-43c5-8c08-11a3789ab93b"

if [ ! -f "$SOURCE" ]; then
  echo "### downloading full Philippines extract (432 MB) ###"
  temporary="$SOURCE.download.$$"
  trap 'rm -f "$temporary"' EXIT HUP INT TERM
  curl --fail --location --retry 3 --output "$temporary" "$SOURCE_URL"
  mv "$temporary" "$SOURCE"
  trap - EXIT HUP INT TERM
else
  echo "### $SOURCE already present, skipping download ###"
fi

sha256sum --check --strict osm-source.sha256

echo "### cropping to region: $REGION ###"
# --no-overview: this deployment shows only its own province, so the
# nationwide low-zoom levels are dropped too. --min-zoom 9 is one below the
# clients' minZoom of 10, because tileserver-gl renders a raster tile at zoom
# Z from vector tiles at Z-1 -- without z9 present, z10 renders blank.
OUTPUT="osm-$REGION.mbtiles"
TEMPORARY_OUTPUT="$OUTPUT.new.$$"
trap 'rm -f "$TEMPORARY_OUTPUT"' EXIT HUP INT TERM
python3 ./crop-mbtiles.py --region "$REGION" --no-overview --min-zoom 9 --output "$TEMPORARY_OUTPUT"

SOURCE_SHA=$(awk 'NR == 1 {print $1}' osm-source.sha256)
python3 - "$TEMPORARY_OUTPUT" "$REGION" "$SOURCE_SHA" <<'PY'
import sqlite3
import sys

path, expected_region, source_sha = sys.argv[1:]
with sqlite3.connect(path) as database:
    database.execute(
        "INSERT OR REPLACE INTO metadata(name, value) VALUES (?, ?)",
        ("sapot:source_sha256", source_sha),
    )
    database.commit()
    integrity = database.execute("PRAGMA integrity_check").fetchone()[0]
    metadata = dict(database.execute("SELECT name, value FROM metadata"))
if integrity != "ok":
    raise SystemExit(f"MBTiles integrity check failed: {integrity}")
expected = {
    "sapot:region": expected_region,
    "sapot:source_sha256": source_sha,
    "minzoom": "9",
    "maxzoom": "14",
    "scheme": "tms",
}
for key, value in expected.items():
    if metadata.get(key) != value:
        raise SystemExit(f"MBTiles metadata {key}={metadata.get(key)!r}, expected {value!r}")
PY
mv "$TEMPORARY_OUTPUT" "$OUTPUT"
trap - EXIT HUP INT TERM

if "$CLEANUP_SOURCE"; then
  rm -f "$SOURCE"
fi

echo
echo "Serving file is $OUTPUT."
if ! "$CLEANUP_SOURCE"; then
  echo "The $SOURCE source (432 MB) is no longer needed at runtime. Remove it"
  echo "if disk is tight, but it must be downloaded again to cut another region."
fi
