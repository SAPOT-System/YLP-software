#!/usr/bin/env python3
"""Crop a large .mbtiles extract down to one deployment region.

The full Philippines extract is ~432 MB, and most of that is detail for parts
of the country a given SAPOT deployment will never look at. Two modes:

  * default        -- keep z0-OVERVIEW_MAX for the whole source extent
    (country-wide context, so zooming out never shows a blank map) plus
    everything above it only inside the region box.
  * --no-overview  -- keep *only* tiles inside the region box. Smaller, and
    the map is the region and nothing else.

Tile granularity limits how tight "only this region" can be: a z9 tile spans
~0.7 degrees, so low-zoom tiles inevitably carry some neighbouring area. The
region box plus a matching client-side maxBounds/minZoom is what actually
keeps users inside the deployment area.

Note the zoom floor is one *below* the lowest zoom the clients display:
tileserver-gl renders a raster tile at zoom Z from vector tiles at Z-1, so a
file whose lowest stored zoom is 10 renders blank at z10 and only works from
z11 up. Keep --min-zoom one under the clients' minZoom.

The source file is opened read-only and never modified. The output is built
fresh rather than copy-then-DELETE-then-VACUUM, which keeps peak disk usage
at the size of the *output* (tens of MB) instead of ~3x the input.

Usage:
    ./crop-mbtiles.py --region batangas --no-overview --min-zoom 9
    ./crop-mbtiles.py --region batangas
    ./crop-mbtiles.py --region batangas --input other.mbtiles --output out.mbtiles
    ./crop-mbtiles.py --list
"""

from __future__ import annotations

import argparse
import math
import os
import sqlite3
import sys

DEFAULT_INPUT = "osm-2020-02-10-v3.11_asia_philippines.mbtiles"

# Zoom split. Tiles at or below the overview zoom are kept for the entire
# source extent; everything above it is kept only inside the region. Lowering
# this is the single biggest storage lever after the region box itself --
# whole-country z10 and z11 cost ~17 MB between them, and the source carries
# *global* coverage up to z5 (see `maskLevel` in the file's metadata), so the
# low zooms are not as cheap as they look.
DEFAULT_OVERVIEW_MAX_ZOOM = 9

# Zoom floor used with --no-overview. Below this there is no such thing as a
# region-only tile: a single z8 tile spans roughly half of Luzon, so keeping
# lower zooms would drag neighbouring provinces back in no matter how tight
# the region box is. Pair this with a matching client-side minZoom.
DEFAULT_REGION_ONLY_MIN_ZOOM = 10

# Region bounding boxes as (west, south, east, north) in degrees.
# Each is padded ~0.12 deg (~13 km) beyond the administrative boundary so
# rescuers working near a provincial border still get detail tiles.
REGIONS: dict[str, tuple[float, float, float, float]] = {
    "batangas": (120.45, 13.40, 121.60, 14.32),
    "metro-manila": (120.75, 14.20, 121.55, 14.95),
    "calabarzon": (120.30, 13.10, 122.30, 15.00),
    "luzon": (119.60, 12.40, 124.30, 18.80),
}


def lon_to_tile_x(lon: float, zoom: int) -> int:
    return int((lon + 180.0) / 360.0 * (2**zoom))


def lat_to_tile_y(lat: float, zoom: int) -> int:
    """Web-Mercator tile Y (XYZ convention: Y increases southward)."""
    lat_rad = math.radians(lat)
    return int(
        (1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi)
        / 2.0
        * (2**zoom)
    )


def tile_ranges(bbox: tuple[float, float, float, float], zoom: int):
    """Return (x_min, x_max, row_min, row_max) for a bbox at one zoom.

    Rows are TMS (bottom-up), matching this file's `scheme=tms` metadata --
    not the XYZ convention the conversion helpers above produce.
    """
    west, south, east, north = bbox
    x_min = lon_to_tile_x(west, zoom)
    x_max = lon_to_tile_x(east, zoom)
    y_north = lat_to_tile_y(north, zoom)
    y_south = lat_to_tile_y(south, zoom)
    max_index = 2**zoom - 1
    return x_min, x_max, max_index - y_south, max_index - y_north


# The mbtiles "dedup" layout: `map` holds the tile coordinates, `images` holds
# the blobs keyed by tile_id, and the `tiles` view joins them. Identical tiles
# (all that empty ocean) are stored once and referenced many times.
OUTPUT_SCHEMA = """
CREATE TABLE images (tile_id TEXT, tile_data BLOB);
CREATE TABLE map (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_id TEXT);
CREATE TABLE metadata (name TEXT, value TEXT);
CREATE TABLE omtm (name TEXT, value TEXT);
CREATE VIEW tiles AS
  SELECT map.zoom_level AS zoom_level,
         map.tile_column AS tile_column,
         map.tile_row AS tile_row,
         images.tile_data AS tile_data
  FROM map JOIN images ON map.tile_id = images.tile_id;
"""


def build(
    source_path: str,
    output_path: str,
    region: str,
    bbox,
    overview_max_zoom: int | None,
    min_zoom: int,
) -> None:
    if os.path.exists(output_path):
        sys.exit(f"error: {output_path} already exists; remove it or pass --output")

    # uri=True is required for the read-only ATTACH below to be interpreted as
    # a URI at all; without it SQLite treats the whole "file:...?mode=ro"
    # string as a literal filename and silently creates an empty database.
    db = sqlite3.connect(output_path, uri=True)
    db.executescript(OUTPUT_SCHEMA)
    # Read-only attach: the source extract is the only copy of this data and
    # is gitignored, so it must not be written to under any circumstance.
    # (A `query_only` pragma would apply to the whole connection, including
    # the output database, so mode=ro on the attach is the right lever.)
    db.execute("ATTACH DATABASE ? AS src", (f"file:{os.path.abspath(source_path)}?mode=ro",))

    source_tiles = db.execute("SELECT COUNT(*) FROM src.map").fetchone()[0]
    if source_tiles == 0:
        sys.exit(f"error: {source_path} attached but contains no tiles")

    if overview_max_zoom is None:
        detail_from = min_zoom
    else:
        db.execute(
            "INSERT INTO map SELECT zoom_level, tile_column, tile_row, tile_id "
            "FROM src.map WHERE zoom_level BETWEEN ? AND ?",
            (min_zoom, overview_max_zoom),
        )
        overview_rows = db.execute("SELECT COUNT(*) FROM map").fetchone()[0]
        print(f"  overview  z{min_zoom}-{overview_max_zoom:<2} (full extent) : {overview_rows:>9,} tiles")
        detail_from = overview_max_zoom + 1

    source_max_zoom = db.execute("SELECT MAX(zoom_level) FROM src.map").fetchone()[0]
    for zoom in range(detail_from, source_max_zoom + 1):
        x_min, x_max, row_min, row_max = tile_ranges(bbox, zoom)
        db.execute(
            "INSERT INTO map SELECT zoom_level, tile_column, tile_row, tile_id "
            "FROM src.map WHERE zoom_level = ? "
            "AND tile_column BETWEEN ? AND ? AND tile_row BETWEEN ? AND ?",
            (zoom, x_min, x_max, row_min, row_max),
        )
        kept = db.execute("SELECT COUNT(*) FROM map WHERE zoom_level = ?", (zoom,)).fetchone()[0]
        print(f"  detail    z{zoom:<2} ({region:<12}) : {kept:>9,} tiles")

    # Only the blobs the retained coordinates actually reference. GROUP BY
    # collapses the handful of duplicate tile_id rows present in the source,
    # which otherwise make the `tiles` view fan out and return each affected
    # tile twice.
    db.execute(
        "INSERT INTO images (tile_id, tile_data) "
        "SELECT tile_id, MAX(tile_data) FROM src.images "
        "WHERE tile_id IN (SELECT DISTINCT tile_id FROM map) GROUP BY tile_id"
    )

    db.execute("INSERT INTO metadata SELECT name, value FROM src.metadata")
    db.execute("INSERT INTO omtm SELECT name, value FROM src.omtm")

    # MapLibre reads `bounds`/`minzoom` from the TileJSON and will not request
    # tiles outside them, so they must describe what this file actually holds:
    #
    #   with an overview -> keep the *source* extent, otherwise the nationwide
    #     low-zoom levels we deliberately kept would never be requested;
    #   region-only      -> advertise the region box and the zoom floor, so
    #     clients stop asking for tiles that were never included.
    center_lon = (bbox[0] + bbox[2]) / 2
    center_lat = (bbox[1] + bbox[3]) / 2
    db.execute(
        "UPDATE metadata SET value = ? WHERE name = 'center'",
        (f"{center_lon:.5f},{center_lat:.5f},13",),
    )
    db.execute("UPDATE metadata SET value = ? WHERE name = 'minzoom'", (str(min_zoom),))
    if overview_max_zoom is None:
        db.execute(
            "UPDATE metadata SET value = ? WHERE name = 'bounds'",
            (",".join(str(v) for v in bbox),),
        )
    db.executemany(
        "INSERT INTO metadata (name, value) VALUES (?, ?)",
        [
            ("sapot:region", region),
            ("sapot:region_bounds", ",".join(str(v) for v in bbox)),
            ("sapot:overview_max_zoom", "none" if overview_max_zoom is None else str(overview_max_zoom)),
        ],
    )

    # Indexes last: building them once over the finished tables is much faster
    # than maintaining them across every insert above.
    db.execute("CREATE INDEX map_index ON map (zoom_level, tile_column, tile_row)")
    db.execute("CREATE INDEX images_index ON images (tile_id)")
    # Scoped to `main`: a bare ANALYZE writes stats into every attached
    # database, and `src` is attached read-only.
    db.execute("ANALYZE main")
    db.commit()
    db.execute("DETACH DATABASE src")
    db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--region", choices=sorted(REGIONS), help="region to keep detail tiles for")
    parser.add_argument("--input", default=DEFAULT_INPUT, help=f"source .mbtiles (default: {DEFAULT_INPUT})")
    parser.add_argument("--output", help="output .mbtiles (default: osm-<region>.mbtiles)")
    parser.add_argument("--overview-max-zoom", type=int, default=DEFAULT_OVERVIEW_MAX_ZOOM,
                        help=f"keep all tiles at/below this zoom for the whole extent (default: {DEFAULT_OVERVIEW_MAX_ZOOM})")
    parser.add_argument("--no-overview", action="store_true",
                        help="drop the nationwide overview entirely -- keep only tiles inside the region box")
    parser.add_argument("--min-zoom", type=int, default=None,
                        help=f"lowest zoom to include (default: 0, or {DEFAULT_REGION_ONLY_MIN_ZOOM} with --no-overview)")
    parser.add_argument("--list", action="store_true", help="list available regions and exit")
    args = parser.parse_args()

    if args.list:
        for name, bbox in sorted(REGIONS.items()):
            print(f"{name:<14} {bbox}")
        return

    if not args.region:
        parser.error("--region is required (see --list)")
    if not os.path.exists(args.input):
        sys.exit(f"error: {args.input} not found -- run ./download-script.sh first")

    output_path = args.output or f"osm-{args.region}.mbtiles"
    bbox = REGIONS[args.region]

    print(f"cropping {args.input} -> {output_path}")
    overview_max_zoom = None if args.no_overview else args.overview_max_zoom
    if args.min_zoom is not None:
        min_zoom = args.min_zoom
    elif args.no_overview:
        min_zoom = DEFAULT_REGION_ONLY_MIN_ZOOM
    else:
        min_zoom = 0
    if overview_max_zoom is not None and min_zoom > overview_max_zoom:
        parser.error(f"--min-zoom {min_zoom} is above --overview-max-zoom {overview_max_zoom}")

    build(args.input, output_path, args.region, bbox, overview_max_zoom, min_zoom)

    before = os.path.getsize(args.input) / 1048576
    after = os.path.getsize(output_path) / 1048576
    print(f"\n{before:.1f} MB -> {after:.1f} MB  ({100 * (1 - after / before):.0f}% smaller)")


if __name__ == "__main__":
    main()
