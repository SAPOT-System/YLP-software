#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path, PurePosixPath
import tarfile


def _read_member(archive: tarfile.TarFile, name: str):
    member = archive.extractfile(name)
    if member is None:
        raise ValueError(f"archive member is not a regular file: {name}")
    return member


def _unpacked_layer_size(archive: tarfile.TarFile, name: str) -> int:
    member_info = archive.getmember(name)
    member = _read_member(archive, name)
    prefix = member.read(4)
    member.seek(0)
    if prefix.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=member) as layer:
            return sum(len(chunk) for chunk in iter(lambda: layer.read(1024 * 1024), b""))
    if prefix == b"\x28\xb5\x2f\xfd":
        raise ValueError(f"zstd-compressed Docker layer is not supported: {name}")
    return member_info.size


def inspect_archive(path: Path, tag: str) -> tuple[str, int]:
    with tarfile.open(path) as archive:
        manifest = json.load(_read_member(archive, "manifest.json"))
        entries = [entry for entry in manifest if tag in entry.get("RepoTags", [])]
        if len(entries) != 1:
            raise ValueError(f"cannot resolve {tag} in {path}")
        entry = entries[0]
        config_digest = "sha256:" + PurePosixPath(entry["Config"]).name
        unpacked_size = sum(_unpacked_layer_size(archive, layer) for layer in entry["Layers"])
    return config_digest, unpacked_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("tag")
    args = parser.parse_args()
    config_digest, unpacked_size = inspect_archive(args.archive, args.tag)
    print(config_digest)
    print(unpacked_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
