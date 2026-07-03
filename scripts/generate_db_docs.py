#!/usr/bin/env python3
"""Regenerate docs/database/tables.md and erd.md from server/app/models/.

Source of truth is ``SQLModel.metadata`` after importing ``app.main`` (the
same set of tables FastAPI's startup ``create_all()`` call would create).
This script:

1. Imports the FastAPI app (dummy-but-shaped env vars, same as
   generate_openapi_docs.py — never touches a real DB/Redis/GSM gateway).
2. Walks ``SQLModel.metadata.sorted_tables`` and emits one Markdown table per
   DB table: column name, type, nullable, PK/unique/index/FK flags.
3. Emits a Mermaid ``erDiagram`` from the same metadata's foreign keys.
4. Appends a static "Mobile App Tables (WatermelonDB)" section, which is
   sourced from mobile-app/sapot-mobile-app/.../schema.ts — a TypeScript
   file outside SQLModel's reach, so it stays hand-maintained here rather
   than introspected.

Usage:
    python3 scripts/generate_db_docs.py            # write tables.md + erd.md
    python3 scripts/generate_db_docs.py --check     # CI mode: diff only

Requires the server's Python deps to be importable, e.g.:
    server/.venv/bin/python3 scripts/generate_db_docs.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = REPO_ROOT / "server"
DB_DOCS_DIR = REPO_ROOT / "docs" / "database"

os.environ.setdefault("DATABASE_URL", "mysql+pymysql://dummy:dummy@localhost/dummy")
os.environ.setdefault("JWT_SECRET_KEY", "dummy-secret-for-db-doc-generation-only")
os.environ.setdefault("CORS_ALLOWED_ORIGINS", "http://localhost")
os.environ.setdefault("GSM_SECRET", "dummy-gsm-secret-for-doc-generation")
os.environ.setdefault("SERVER_ED25519_SEED", "00" * 32)
os.environ.setdefault("ENVIRONMENT", "development")

sys.path.insert(0, str(SERVER_DIR))

# Tables that exist as SQLModel classes but are never imported anywhere the
# running app reaches from `app.main` (dead code / test-only fixtures at the
# time this script was written). Imported explicitly here so they still show
# up in the generated docs — but flagged, since they won't actually be
# created by `SQLModel.metadata.create_all(engine)` in production unless
# something else starts importing them.
_ORPHANED_MODELS = [
    "app.models.device_key",  # DeviceKey — only imported by tests/test_ip_lockout.py
    # app.models.devices.Device is NOT imported here: it declares no primary
    # key (`id` has no `primary_key=True`), so SQLAlchemy raises ArgumentError
    # on class definition. It cannot be mapped at all in its current form —
    # broken, dead code. Documented as a known issue in TABLES_MOBILE_APPENDIX's
    # sibling note below rather than silently imported.
]


def _import_orphans() -> set[str]:
    """Import models unreachable from app.main so they still appear in docs.

    Returns the set of table names that came from these orphaned imports.
    """
    from sqlmodel import SQLModel

    before = set(SQLModel.metadata.tables.keys())
    for mod in _ORPHANED_MODELS:
        try:
            __import__(mod)
        except ImportError as exc:  # pragma: no cover - flagged, not fatal
            print(f"WARNING: could not import orphaned model {mod}: {exc}", file=sys.stderr)
    after = set(SQLModel.metadata.tables.keys())
    return after - before


def _column_type(col) -> str:
    return str(col.type)


def _column_notes(table, col) -> list[str]:
    notes = []
    if col.primary_key:
        notes.append("PK")
    for fk in col.foreign_keys:
        notes.append(f"FK -> {fk.target_fullname}")
    if col.unique:
        notes.append("unique")
    if col.index:
        notes.append("indexed")
    if col.nullable is False and not col.primary_key:
        notes.append("not null")
    if col.default is not None:
        notes.append("has default")
    return notes


def build_tables_section(orphaned_tables: set[str]) -> str:
    from sqlmodel import SQLModel

    lines = []
    for table in SQLModel.metadata.sorted_tables:
        lines.append(f"### `{table.name}`")
        lines.append("")
        if table.name in orphaned_tables:
            lines.append(
                "> **Orphaned model:** not imported anywhere `app.main` reaches at import "
                "time — this table is not created by `create_all()` in production unless "
                "something else imports its module first. See the model's docstring/usage."
            )
            lines.append("")
        lines.append("| Column | Type | Notes |")
        lines.append("|---|---|---|")
        for col in table.columns:
            notes = ", ".join(_column_notes(table, col)) or "—"
            lines.append(f"| `{col.name}` | {_column_type(col)} | {notes} |")
        lines.append("")
    return "\n".join(lines)


def build_erd() -> str:
    from sqlmodel import SQLModel

    lines = ["```mermaid", "erDiagram"]
    for table in SQLModel.metadata.sorted_tables:
        lines.append(f"    {table.name} {{")
        for col in table.columns:
            type_token = _column_type(col).split("(")[0].strip().replace(" ", "_")
            flag = "PK" if col.primary_key else ("FK" if col.foreign_keys else "")
            lines.append(f"        {type_token} {col.name} {flag}".rstrip())
        lines.append("    }")

    for table in SQLModel.metadata.sorted_tables:
        for col in table.columns:
            for fk in col.foreign_keys:
                target_table = fk.column.table.name
                if target_table == table.name:
                    continue  # self-referential FKs omitted for readability
                lines.append(f'    {target_table} ||--o{{ {table.name} : "{col.name}"')
    lines.append("```")
    return "\n".join(lines)


TABLES_HEADER = """# Database Tables Reference

Derived from `server/app/models/` via `scripts/generate_db_docs.py`. For the ERD see
[erd.md](erd.md). Do not hand-edit the generated sections below this line —
run `python3 scripts/generate_db_docs.py` instead.

All tables use MariaDB. Schema is auto-created at startup — see [migrations.md](migrations.md).

> **Known issue:** `app.models.devices.Device` (table `device`) declares `id` without
> `primary_key=True`. SQLAlchemy raises `ArgumentError: could not assemble any primary key
> columns` the moment its module is imported, so it cannot be mapped at all in its current
> form. It is not imported anywhere in `server/app` and does not appear below.

---

"""

TABLES_MOBILE_APPENDIX = """
---

## Mobile App Tables (WatermelonDB)

Not introspectable from `server/app/models/` (different language/ORM) — hand-maintained here
from `mobile-app/sapot-mobile-app/features/shared/core/database/schema.ts` (schema version 11).
All tables use WatermelonDB's implicit `id` primary key (framework-managed, not declared in
`tableSchema()`). For migration history per column, see
[migrations.md](migrations.md#mobile-app-watermelondb).

### `guest_user`

| Column | Type | Notes |
|---|---|---|
| `first_name` | string | — |
| `last_name` | string | — |
| `username` | string | — |

### `peers`

| Column | Type | Notes |
|---|---|---|
| `username` | string | — |
| `is_online` | boolean | — |
| `first_name` | string | — |
| `last_name` | string | optional |
| `email` | string | optional; current authenticated user's own profile mirror |
| `phone_number` | string | optional |
| `email_verified` | boolean | optional (added v4) |
| `phone_number_verified` | boolean | optional (added v7) — declared twice in `schema.ts`'s column array; a source-level duplicate, not a docs error |
| `role` | string | optional (added v9) |
| `is_guest` | boolean | optional (added v10) |
| `last_seen_at` | number | optional (added v11) |

### `messages`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `sender` | string | FK to `peers.id` |
| `message_type` | string | — |
| `content` | string | — |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |
| `linked_message_id` | string | optional (added v8) — formerly paired a P2P message with its SMS duplicate for the dual-send UX (removed); column retained unused, no longer read or written |
| `is_encrypted` | boolean | optional (added v9) |

### `calls`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `initiator` | string | FK to `peers.id` |
| `call_type` | string | — |
| `status` | string | — |
| `start_time` | number | ms epoch |
| `end_time` | number | optional, ms epoch |
| `updated_at` | number | ms epoch |
| `created_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `call_participants`

| Column | Type | Notes |
|---|---|---|
| `call` | string | FK to `calls.id` |
| `user` | string | FK to `peers.id` |
| `joined_at` | number | ms epoch |
| `left_at` | number | optional, ms epoch |
| `updated_at` | number | ms epoch |
| `created_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `message_receipts`

| Column | Type | Notes |
|---|---|---|
| `message` | string | FK to `messages.id` |
| `user` | string | FK to `peers.id` |
| `status` | string | — |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `conversations`

| Column | Type | Notes |
|---|---|---|
| `type` | string | — |
| `title` | string | optional |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |

### `conversation_participants`

| Column | Type | Notes |
|---|---|---|
| `conversation` | string | FK to `conversations.id` |
| `user` | string | FK to `peers.id` |
| `joined_at` | number | ms epoch |
| `is_deleted` | boolean | soft-delete |
| `created_at` | number | ms epoch |
| `updated_at` | number | ms epoch |
"""

ERD_HEADER = """# Entity-Relationship Diagram

Derived from `server/app/models/` via `scripts/generate_db_docs.py`. For per-table column
details see [tables.md](tables.md). Do not hand-edit the diagram below — run
`python3 scripts/generate_db_docs.py` instead.

"""

ERD_FOOTER = """

---

## Notes

- `callparticipant.call_id` is a FK to `conversation.id`, not `call.id` — see
  [schema-overview.md](schema-overview.md) for details.
- Router metric tables (`routerhealth`, `interfacetraffic`) and `guest_sessions` have no FK to
  `user` and appear above with no edges.
- `mobile app` (WatermelonDB) tables are not part of this diagram — see
  [tables.md](tables.md#mobile-app-tables-watermelondb).
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Don't write files; exit non-zero if generated output differs from what's committed.",
    )
    args = parser.parse_args()

    from app.main import app  # noqa: F401,PLC0415  (import after env vars are set; registers metadata)

    orphaned_tables = _import_orphans()

    tables_content = TABLES_HEADER + build_tables_section(orphaned_tables) + TABLES_MOBILE_APPENDIX
    erd_content = ERD_HEADER + build_erd() + ERD_FOOTER

    drift = False
    for name, content in (("tables.md", tables_content), ("erd.md", erd_content)):
        out_path = DB_DOCS_DIR / name
        if args.check:
            existing = out_path.read_text() if out_path.exists() else ""
            if existing != content:
                drift = True
                print(f"DRIFT: {out_path.relative_to(REPO_ROOT)} is stale", file=sys.stderr)
        else:
            out_path.write_text(content)
            print(f"wrote {out_path.relative_to(REPO_ROOT)}")

    if args.check and drift:
        print("DB docs are stale. Run: python3 scripts/generate_db_docs.py", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
