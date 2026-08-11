#!/usr/bin/env python3
"""Small dependency-free SemVer comparator for SAPOT deployment scripts."""
import re
import sys

PATTERN = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$")
STAGES = {"alpha": 0, "beta": 1, "rc": 2}


def parse(value: str):
    match = PATTERN.fullmatch(value)
    if not match:
        raise ValueError(f"invalid SAPOT version: {value}")
    major, minor, patch, stage, number = match.groups()
    # A final release sorts after every prerelease for the same X.Y.Z.
    suffix = (3, 0) if stage is None else (STAGES[stage], int(number))
    return int(major), int(minor), int(patch), suffix


def compare(left: str, right: str) -> int:
    a, b = parse(left), parse(right)
    return (a > b) - (a < b)


def satisfies(version: str, constraint: str) -> bool:
    match = re.fullmatch(r"(>=|>|<=|<|=)\s*(.+)", constraint.strip())
    if not match:
        raise ValueError(f"unsupported version range: {constraint}")
    operator, expected = match.groups()
    result = compare(version, expected)
    return {
        ">=": result >= 0,
        ">": result > 0,
        "<=": result <= 0,
        "<": result < 0,
        "=": result == 0,
    }[operator]


def main() -> int:
    if len(sys.argv) == 4 and sys.argv[1] == "compare":
        print(compare(sys.argv[2], sys.argv[3]))
        return 0
    if len(sys.argv) == 4 and sys.argv[1] == "satisfies":
        return 0 if satisfies(sys.argv[2], sys.argv[3]) else 1
    print("usage: semver.py compare <a> <b> | satisfies <version> <range>", file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ValueError as error:
        print(f"semver: {error}", file=sys.stderr)
        raise SystemExit(2)
