#!/usr/bin/env python3
"""Enforce GitHub Release's deployment-bundle archive limit."""
import argparse
from pathlib import Path
import sys

LIMIT = 2_147_483_648

def validate(path: Path) -> None:
    size = path.stat().st_size
    if size >= LIMIT:
        raise ValueError(f"archive size {size} bytes must be smaller than {LIMIT} bytes")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    try: validate(args.archive)
    except (OSError, ValueError) as error:
        print(f"archive size validation failed: {error}", file=sys.stderr); raise SystemExit(1)
