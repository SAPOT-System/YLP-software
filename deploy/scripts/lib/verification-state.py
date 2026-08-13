#!/usr/bin/env python3
"""Validate the non-executable backup verification state format."""

import json
import re
import sys
from pathlib import Path

FILENAME = re.compile(r"^sapot_db_\d{8}T\d{6}Z\.sql\.gz$")
REASONS = {
    "NO_BACKUP", "INVALID_CONFIG", "INVALID_DUMP", "INSUFFICIENT_SPACE",
    "RUNTIME_UNAVAILABLE", "START_TIMEOUT", "RESTORE_FAILED", "STRUCTURE_FAILED",
    "SCHEMA_INVALID", "ROW_COUNT_MISMATCH", "SUPERSEDED", "CLEANUP_FAILED",
    "INTERNAL_ERROR",
}
BACKENDS = {"bundle-docker", "baremetal-local"}


def fail(message: str) -> None:
    raise ValueError(message)


def validate(value: object) -> dict:
    if not isinstance(value, dict):
        fail("state must be an object")
    required = {
        "schemaVersion", "status", "checkedAtEpoch", "backupFilename", "compressedSize",
        "backupMtimeEpoch", "sha256", "durationSeconds", "backend", "schemaRevision",
        "tablesChecked", "rowsChecked", "keyTableCounts", "reason", "message",
    }
    if set(value) != required:
        fail("state fields do not match schema 1.0")
    if value["schemaVersion"] != "1.0" or value["status"] not in {"PASS", "FAIL"}:
        fail("unsupported state schema or status")
    if value["backend"] not in BACKENDS:
        fail("invalid backend")
    if value["backupFilename"] is not None and (not isinstance(value["backupFilename"], str) or not FILENAME.fullmatch(value["backupFilename"])):
        fail("invalid backup filename")
    if value["sha256"] is not None and (not isinstance(value["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", value["sha256"])):
        fail("invalid sha256")
    for field in ("checkedAtEpoch", "compressedSize", "backupMtimeEpoch", "durationSeconds", "tablesChecked", "rowsChecked"):
        if value[field] is not None and (type(value[field]) is not int or value[field] < 0):
            fail(f"invalid {field}")
    if value["schemaRevision"] is not None and (not isinstance(value["schemaRevision"], str) or not re.fullmatch(r"[0-9a-f]{12}", value["schemaRevision"])):
        fail("invalid schema revision")
    if not isinstance(value["keyTableCounts"], dict) or any(not isinstance(k, str) or type(v) is not int or v < 0 for k, v in value["keyTableCounts"].items()):
        fail("invalid key table counts")
    if value["status"] == "PASS":
        if value["reason"] is not None:
            fail("successful state must not have a reason")
    elif value["reason"] not in REASONS:
        fail("failed state has an invalid reason")
    if not isinstance(value["message"], str):
        fail("invalid message")
    return value


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: verification-state.py STATE_FILE", file=sys.stderr)
        return 2
    try:
        with Path(sys.argv[1]).open(encoding="utf-8") as source:
            state = validate(json.load(source))
        print(json.dumps(state, separators=(",", ":"), sort_keys=True))
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"invalid verification state: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
