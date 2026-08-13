#!/usr/bin/env python3
"""Validate the independent deployment-bundle version and release policy."""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
SEMVER_PATH = ROOT / "deploy" / "scripts" / "lib" / "semver.py"
TAG_PATTERN = re.compile(r"bundle/v(.+)")


def load_semver_module():
    spec = importlib.util.spec_from_file_location("sapot_semver", SEMVER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load SemVer helper from {SEMVER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate(
    version_file: Path,
    policy_file: Path,
    tag: str | None = None,
    candidate_version: str | None = None,
) -> dict[str, str]:
    semver = load_semver_module()
    version = candidate_version or version_file.read_text(encoding="utf-8").strip()
    semver.parse(version)
    if semver.parse(version)[:3] < (0, 0, 1):
        raise ValueError(f"bundle version ({version}) must have a core version of at least 0.0.1")

    policy = json.loads(policy_file.read_text(encoding="utf-8"))
    expected_keys = {
        "schemaVersion",
        "minimumUpgradeVersion",
        "minimumRollbackVersion",
    }
    if set(policy) != expected_keys:
        missing = sorted(expected_keys - set(policy))
        extra = sorted(set(policy) - expected_keys)
        raise ValueError(f"invalid policy keys: missing={missing}, extra={extra}")
    if policy["schemaVersion"] != "1.0":
        raise ValueError("unsupported bundle release policy schema")

    for field in ("minimumUpgradeVersion", "minimumRollbackVersion"):
        value = policy[field]
        semver.parse(value)
        if semver.parse(value)[:3] < (0, 0, 1):
            raise ValueError(f"{field} ({value}) must have a core version of at least 0.0.1")

    initial_family = version.startswith("0.0.1") and (
        version == "0.0.1" or re.fullmatch(r"0\.0\.1-(alpha|beta|rc)\.(0|[1-9]\d*)", version)
    )
    upgrade = policy["minimumUpgradeVersion"]
    rollback = policy["minimumRollbackVersion"]
    if initial_family:
        if upgrade != version or rollback != version:
            raise ValueError(
                "fresh-install 0.0.1 releases require minimumUpgradeVersion and "
                "minimumRollbackVersion to equal the bundle version"
            )
    else:
        if semver.compare(upgrade, version) >= 0:
            raise ValueError(
                f"minimumUpgradeVersion ({upgrade}) must be older than bundle version ({version})"
            )
        if semver.compare(rollback, upgrade) > 0:
            raise ValueError(
                f"minimumRollbackVersion ({rollback}) cannot be newer than "
                f"minimumUpgradeVersion ({upgrade})"
            )

    if tag is not None:
        match = TAG_PATTERN.fullmatch(tag)
        if match is None:
            raise ValueError(f"invalid bundle tag: {tag}")
        if match.group(1) != version:
            raise ValueError(f"bundle tag version ({match.group(1)}) does not match deploy/VERSION ({version})")

    return {
        "version": version,
        "minimumUpgradeVersion": policy["minimumUpgradeVersion"],
        "minimumRollbackVersion": policy["minimumRollbackVersion"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version-file", type=Path, default=ROOT / "deploy" / "VERSION")
    parser.add_argument("--policy", type=Path, default=ROOT / "deploy" / "bundle-release-policy.json")
    parser.add_argument("--tag")
    parser.add_argument("--candidate-version")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    try:
        values = validate(args.version_file, args.policy, args.tag, args.candidate_version)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"bundle release validation failed: {error}", file=sys.stderr)
        return 1

    if args.as_json:
        print(json.dumps(values, separators=(",", ":")))
    else:
        print(f"bundle release metadata is valid for v{values['version']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
