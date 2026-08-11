#!/usr/bin/env python3
"""Validate an extracted bundle at the build and release trust boundaries."""
from __future__ import annotations
import argparse, hashlib, json, os, stat
from pathlib import Path
import sys
import jsonschema

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_CA_FILENAMES = {"server_ca.key", "server_ca.pem"}

def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""): value.update(chunk)
    return value.hexdigest()

def contains_forbidden_ca_material(root: Path) -> bool:
    return (root / "docker/gen-certs.sh").exists() or any(
        path.name in FORBIDDEN_CA_FILENAMES for path in root.rglob("*")
    )

def validate(root: Path, version: str, commit: str, metadata_path: Path) -> None:
    manifest = json.loads((root / "manifest.json").read_text())
    schema = json.loads((ROOT / "deploy" / "manifest.schema.json").read_text())
    jsonschema.validate(manifest, schema)
    if manifest["version"] != version or manifest["gitSha"] != commit: raise ValueError("manifest release identity does not match expected tag")
    map_contract = json.loads(metadata_path.read_text())
    if manifest["mapData"] != {key: map_contract[key] for key in manifest["mapData"]}: raise ValueError("manifest map provenance does not match map artifact contract")
    if manifest["gsmFirmware"]["compatibleGsmFastapiVersion"] != "=" + manifest["componentVersions"]["gsmFastapi"]: raise ValueError("firmware compatibility does not match GSM service")
    if contains_forbidden_ca_material(root): raise ValueError("bundle contains forbidden CA material")
    regular = set(); entries = {}
    for path in root.rglob("*"):
        mode = path.lstat().st_mode
        relative = path.relative_to(root).as_posix()
        if stat.S_ISDIR(mode): continue
        if not stat.S_ISREG(mode): raise ValueError(f"forbidden bundle entry type: {relative}")
        if relative != "CHECKSUMS.sha256": regular.add(relative)
    for line in (root / "CHECKSUMS.sha256").read_text().splitlines():
        try: expected, raw = line.split("  ", 1)
        except ValueError: raise ValueError("invalid checksum entry")
        normalized = Path(raw).as_posix()
        if raw.startswith("/") or ".." in Path(raw).parts or normalized == "CHECKSUMS.sha256" or normalized in entries: raise ValueError("unsafe or duplicate checksum path")
        entries[normalized] = expected
    if set(entries) != regular: raise ValueError("checksum paths must exactly match regular bundle files")
    for relative, expected in entries.items():
        if digest(root / relative) != expected: raise ValueError(f"checksum mismatch: {relative}")

def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("root", type=Path); parser.add_argument("--version", required=True); parser.add_argument("--commit", required=True); parser.add_argument("--metadata", type=Path, default=ROOT / "tileserver/map-artifact.json")
    args = parser.parse_args()
    try: validate(args.root, args.version, args.commit, args.metadata)
    except (OSError, ValueError, KeyError, json.JSONDecodeError, jsonschema.ValidationError) as error:
        print(f"bundle content validation failed: {error}", file=sys.stderr); return 1
    return 0
if __name__ == "__main__": raise SystemExit(main())
