#!/usr/bin/env python3
"""Regenerate docs/api/openapi/*.yaml from the live FastAPI app.

Source of truth is ``app.openapi()`` (server/app/main.py). This script:

1. Imports the FastAPI app (with dummy-but-shaped env vars — it never talks
   to a real DB/Redis/etc, it only needs the schema FastAPI builds at import
   time).
2. Groups paths into the same 12 feature-based fragments that are already
   committed under docs/api/openapi/, using a prefix-based mapping derived
   from each router's ``prefix=`` in server/app/api/*.py.
3. For each group, walks the referenced ``$ref`` schemas (and security
   schemes) transitively so only what's actually used by that group's paths
   is emitted.
4. Serializes deterministically (sorted key order is NOT used — insertion
   order from FastAPI's own dict is preserved, matching the existing
   fragments) and writes/checks the YAML files.

Usage:
    python3 scripts/generate_openapi_docs.py            # write fragments
    python3 scripts/generate_openapi_docs.py --check     # CI mode: diff only

Requires the server's Python deps (fastapi, pyyaml, ...) to be importable,
e.g. run via the `server/.venv` interpreter:

    server/.venv/bin/python3 scripts/generate_openapi_docs.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "server"
OUTPUT_DIR = REPO_ROOT / "docs" / "api" / "openapi"

# --- Dummy env vars required at import time -------------------------------
# server/app/main.py (and modules it imports) require several env vars to be
# set before import, or they raise. This script never connects to a real
# DB / Redis / GSM gateway — it only needs FastAPI's route table to build
# app.openapi(). Values are fixed (not random) so output is byte-identical
# across runs (needed for the CI diff check in H1).
os.environ.setdefault("DATABASE_URL", "mysql+pymysql://dummy:dummy@localhost/dummy")
os.environ.setdefault("JWT_SECRET_KEY", "dummy-secret-for-openapi-doc-generation-only")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://localhost")
os.environ.setdefault("GSM_SECRET", "dummy-gsm-secret-for-doc-generation")
# Ed25519 seed must be 64 hex chars (32 bytes) to parse.
os.environ.setdefault("SERVER_ED25519_SEED", "00" * 32)
# Generate with the dev-only `testing` router included: the committed
# fragments already document /testing/* (useful for engineers running the
# server locally with ENVIRONMENT=development), so we match that.
os.environ.setdefault("ENVIRONMENT", "development")
# Required at import time by app/api/testing.py whenever ENVIRONMENT=development.
os.environ.setdefault("QA_API_TOKEN", "dummy-qa-token-for-doc-generation-only")

sys.path.insert(0, str(SERVER_DIR))

import yaml  # noqa: E402


def _yaml_str_presenter(dumper: yaml.Dumper, data: str):
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(str, _yaml_str_presenter)


# --- Path -> fragment file mapping -----------------------------------------
# Ordered most-specific-prefix-first; first match wins. Derived from each
# router's `prefix=` in server/app/api/*.py, cross-checked against which
# paths currently live in which committed fragment.
_RULES: list[tuple[str, "list[str] | None"]] = [
    ("mikrotik-telemetry", ["/api/admin/router/"]),
    ("admin", ["/api/admin/", "/api/admin"]),
    ("auth-and-recovery", ["/auth/forgot-password/"]),
    ("authentication", ["/auth/"]),
    ("keys-and-encryption", ["/keys/", "/users/"]),
    ("messaging-and-websocket", ["/ws/", "/public-chat"]),
    ("gps", ["/gps/"]),
    ("gsm-sms", ["/gsm/"]),
    ("captive-portal", ["/portal/"]),
    ("profile", ["/profile-picture/"]),
    ("sync", ["/sync/"]),
    (
        "system",
        [
            "/download/",
            "/user-utils/",
            "/update/profile/",
            "/testing/",
        ],
    ),
]
# Exact-match paths that don't share a prefix with anything else.
_SYSTEM_EXACT = {"/", "/ping", "/version"}

GROUP_NAMES = [name for name, _ in _RULES]


def classify(path: str) -> str | None:
    if path in _SYSTEM_EXACT:
        return "system"
    for name, prefixes in _RULES:
        for prefix in prefixes:
            if path.startswith(prefix):
                return name
    return None


def group_paths(spec: dict) -> tuple[dict[str, dict], list[str]]:
    """Return ({group_name: {path: item}}, [unmapped_paths])."""
    groups: dict[str, dict] = {name: {} for name in GROUP_NAMES}
    unmapped: list[str] = []
    for path, item in spec["paths"].items():
        group = classify(path)
        if group is None:
            unmapped.append(path)
            continue
        groups[group][path] = item
    return groups, unmapped


def _collect_refs(node, refs: set[str]) -> None:
    """Recursively collect '#/components/schemas/<Name>' refs from a node."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith("#/components/schemas/"):
                refs.add(value.rsplit("/", 1)[-1])
            else:
                _collect_refs(value, refs)
    elif isinstance(node, list):
        for item in node:
            _collect_refs(item, refs)


def _collect_security_schemes(paths: dict) -> set[str]:
    names: set[str] = set()
    for item in paths.values():
        for op in item.values():
            if not isinstance(op, dict):
                continue
            for sec in op.get("security", []) or []:
                names.update(sec.keys())
    return names


def resolve_schemas(paths: dict, all_schemas: dict) -> dict:
    """Transitively resolve every schema reachable from `paths`."""
    needed: set[str] = set()
    _collect_refs(paths, needed)

    resolved: dict[str, object] = {}
    frontier = set(needed)
    while frontier:
        name = frontier.pop()
        if name in resolved or name not in all_schemas:
            continue
        schema = all_schemas[name]
        resolved[name] = schema
        nested: set[str] = set()
        _collect_refs(schema, nested)
        frontier |= nested - resolved.keys()

    # Preserve the original declaration order from the full spec.
    return {name: all_schemas[name] for name in all_schemas if name in resolved}


def title_for(name: str) -> str:
    return "SAPOT Server — " + name.replace("-", " ").title()


def build_fragment(name: str, paths: dict, full_spec: dict, version: str) -> dict:
    components: dict = {}
    schemas = resolve_schemas(paths, full_spec.get("components", {}).get("schemas", {}))
    if schemas:
        components["schemas"] = schemas

    sec_schemes_needed = _collect_security_schemes(paths)
    all_sec_schemes = full_spec.get("components", {}).get("securitySchemes", {})
    sec_schemes = {n: all_sec_schemes[n] for n in all_sec_schemes if n in sec_schemes_needed}
    if sec_schemes:
        components["securitySchemes"] = sec_schemes

    fragment: dict = {
        "openapi": full_spec.get("openapi", "3.1.0"),
        "info": {
            "title": title_for(name),
            "version": version,
        },
        "paths": {path: paths[path] for path in sorted(paths)},
    }
    if components:
        fragment["components"] = components
    return fragment


def dump_yaml(fragment: dict) -> str:
    return yaml.dump(
        fragment,
        sort_keys=False,
        default_flow_style=False,
        allow_unicode=True,
        width=100000,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Don't write files; exit non-zero if generated output differs from what's committed.",
    )
    args = parser.parse_args()

    from app.main import app  # noqa: PLC0415  (import after env vars are set)

    spec = app.openapi()
    version = spec.get("info", {}).get("version", "")

    groups, unmapped = group_paths(spec)

    if unmapped:
        print("WARNING: the following paths did not match any known feature group:", file=sys.stderr)
        for path in unmapped:
            print(f"  {path}", file=sys.stderr)
        print(
            "These paths were NOT written to any fragment. Update the _RULES mapping in "
            "scripts/generate_openapi_docs.py if this is a new router.",
            file=sys.stderr,
        )

    drift = False
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for name in GROUP_NAMES:
        paths = groups[name]
        if not paths:
            print(f"WARNING: group '{name}' has no paths in the live spec (router removed?)", file=sys.stderr)
            continue
        fragment = build_fragment(name, paths, spec, version)
        content = dump_yaml(fragment)
        out_path = OUTPUT_DIR / f"{name}.yaml"

        if args.check:
            existing = out_path.read_text() if out_path.exists() else ""
            if existing != content:
                drift = True
                print(f"DRIFT: {out_path.relative_to(REPO_ROOT)} is stale", file=sys.stderr)
        else:
            out_path.write_text(content)
            print(f"wrote {out_path.relative_to(REPO_ROOT)} ({len(paths)} paths)")

    if args.check and drift:
        print("OpenAPI docs are stale. Run: python3 scripts/generate_openapi_docs.py", file=sys.stderr)
        return 1

    if unmapped:
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
