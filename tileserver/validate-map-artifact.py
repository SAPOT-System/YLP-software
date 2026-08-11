#!/usr/bin/env python3
"""Validate the reviewed MBTiles release contract and a read-only artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import sys

EXPECTED_KEYS = {"schemaVersion", "region", "repository", "releaseTag", "assetName", "sha256", "size", "bounds", "minZoom", "maxZoom", "scheme", "format"}


def fail(message: str) -> None:
    raise ValueError(message)


def load_contract(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or set(data) != EXPECTED_KEYS:
        fail(f"metadata keys must exactly equal {sorted(EXPECTED_KEYS)}")
    if data["schemaVersion"] != "1.0": fail("unsupported metadata schemaVersion")
    if not all(isinstance(data[key], str) and data[key] for key in ("region", "repository", "releaseTag", "assetName", "scheme", "format")): fail("metadata string field is missing or invalid")
    if not re.fullmatch(r"[0-9a-f]{64}", data["sha256"]): fail("metadata sha256 must be a lowercase 64-character SHA-256")
    if not isinstance(data["size"], int) or isinstance(data["size"], bool) or data["size"] <= 0: fail("metadata size must be a positive integer")
    if not isinstance(data["bounds"], list) or len(data["bounds"]) != 4 or not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in data["bounds"]): fail("metadata bounds must contain four numbers")
    if not all(isinstance(data[key], int) and not isinstance(data[key], bool) for key in ("minZoom", "maxZoom")) or data["minZoom"] > data["maxZoom"]: fail("metadata zoom range is invalid")
    return data


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate(path: Path, contract_path: Path) -> None:
    contract = load_contract(contract_path)
    if not path.is_file(): fail(f"map artifact does not exist: {path}")
    if path.name != contract["assetName"]: fail(f"artifact filename {path.name!r} does not match {contract['assetName']!r}")
    if path.stat().st_size != contract["size"]: fail(f"artifact size is {path.stat().st_size}, expected {contract['size']}")
    actual_sha = sha256(path)
    if actual_sha != contract["sha256"]: fail(f"artifact SHA-256 is {actual_sha}, expected {contract['sha256']}")
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as database:
        integrity = database.execute("PRAGMA integrity_check").fetchone()[0]
        metadata = dict(database.execute("SELECT name, value FROM metadata"))
        tables = {row[0] for row in database.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {table: database.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in ("map", "images") if table in tables}
    if integrity != "ok": fail(f"MBTiles integrity check failed: {integrity}")
    if not {"map", "images"} <= tables or any(counts.get(table, 0) <= 0 for table in ("map", "images")): fail("MBTiles map and images tables must exist and be nonempty")
    expected = {"sapot:region": contract["region"], "bounds": ",".join(str(x) for x in contract["bounds"]), "minzoom": str(contract["minZoom"]), "maxzoom": str(contract["maxZoom"]), "scheme": contract["scheme"], "format": contract["format"]}
    for key, value in expected.items():
        if metadata.get(key) != value: fail(f"MBTiles metadata {key}={metadata.get(key)!r}, expected {value!r}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("artifact", type=Path)
    parser.add_argument("--metadata", type=Path, default=Path(__file__).with_name("map-artifact.json"))
    args = parser.parse_args()
    try: validate(args.artifact, args.metadata)
    except (OSError, ValueError, sqlite3.Error, json.JSONDecodeError) as error:
        print(f"map artifact validation failed: {error}", file=sys.stderr); return 1
    return 0

if __name__ == "__main__": raise SystemExit(main())
