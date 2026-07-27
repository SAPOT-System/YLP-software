# Database Migrations

See [ADR 0002](../adr/0002-no-server-migration-tooling.md) for why the server has no migration tool today.

## Current state: no migration tooling

The SAPOT server uses **no database migration tool**. Schema creation is handled by SQLModel's `create_db_and_tables()` at server startup (`server/app/main.py`, inside the `lifespan` context manager).

`create_db_and_tables()` calls SQLAlchemy's `metadata.create_all()`, which creates any tables that do not yet exist. It does **not**:
- Modify existing tables (add columns, change types, rename columns)
- Drop tables or columns
- Track schema versions
- Provide rollback capability

---

## Operational implications

| Risk | Description |
|---|---|
| **No schema evolution** | Model changes (new column, changed type) must be applied manually to the production database. |
| **No version tracking** | There is no record of what schema state the database is in. |
| **No rollback** | If a schema change breaks production, there is no migration to revert. |
| **Inconsistency risk** | Deploying updated code without applying the corresponding DDL causes runtime errors. |

---

## Current manual migration procedure

When a model changes:
1. Add/change the field in the SQLModel class in `server/app/models/`.
2. Write the equivalent `ALTER TABLE` SQL for MariaDB.
3. Apply it to the production database.
4. Deploy the updated server code.

Historically, no record of which `ALTER TABLE` statements have been applied was
maintained. New changes are logged in [Pending server DDL](#pending-server-ddl)
below until Alembic is adopted.

### Pending server DDL

`create_db_and_tables()` only creates missing tables — it never alters an
existing one. Any database created before the change below still has the old
column type, and **must** have this applied by hand before the matching server
code is deployed.

| Date | Change | MariaDB DDL |
|---|---|---|
| 2026-07-26 | `message.content`: `VARCHAR(255)` → `TEXT`. A 2000-char plaintext message (the client-side cap, `MAX_MESSAGE_LENGTH`) and E2E-encrypted base64 ciphertext both overflow 255 chars, so `/sync/push` failed with a generic 500 `Internal Sync Error`. | `ALTER TABLE message MODIFY COLUMN content TEXT NOT NULL;` |

Verify after applying:

```sql
SHOW COLUMNS FROM message LIKE 'content';   -- expect Type = text
```

```mermaid
flowchart LR
    subgraph Server["Server — manual, untracked"]
        S1["Change SQLModel class"] --> S2["Hand-write ALTER TABLE SQL"]
        S2 --> S3["Apply to production DB<br/>(no version record kept)"]
        S3 --> S4["Deploy updated server code"]
        S4 -.->|"code/DB out of sync until both steps done"| S3
    end

    subgraph Mobile["Mobile (WatermelonDB) — versioned, automatic"]
        M1["Bump version in schema.ts"] --> M2["Add migration step in migrations.ts<br/>(addColumns / createTable, additive only)"]
        M2 --> M3["App start: compare on-device version<br/>to schema.ts version"]
        M3 --> M4["Replay all migrations with<br/>toVersion > stored version, in order"]
    end
```

The asymmetry is the point: the server has no analog of `M3`/`M4` — there is nothing that detects or replays pending schema changes, which is exactly what [adopting Alembic](#recommendation-adopt-alembic) below would add.

---

## GSM-module database note

The GSM module's actual datastore is **MariaDB**, configured via `DB_PATH` in `GSM-module/GSM-fastapi/config.py` (default `mysql+pymysql://sapot:sapot@localhost:3306/sapot_db`; see [environment-config.md](../deployment/environment-config.md)). The repository also has a committed `GSM-module/GSM-fastapi/sapot.db` SQLite file, but it is a stale, unused artifact — no code path reads it. It should be deleted from the repo rather than treated as a fallback database.

---

## Recommendation: adopt Alembic

[Alembic](https://alembic.sqlalchemy.org/) is the standard SQLAlchemy migration tool. It provides:
- Auto-generated migration scripts from model diffs (`--autogenerate`)
- Schema version tracking (`alembic_version` table in the DB)
- `upgrade` and `downgrade` commands for safe deployments

This is a prerequisite for safe production operation. Without it, every schema change is a manual, untracked, irreversible operation.

---

## Mobile App (WatermelonDB)

Unlike the server, the mobile app **does** use a versioned migration tool: WatermelonDB's `schemaMigrations()` (`mobile-app/sapot-mobile-app/features/shared/core/database/migrations.ts`), paired with a versioned `appSchema()` (`schema.ts`, currently **version 11**).

### Mechanism

- `schema.ts` declares the current shape of every table via `tableSchema()` and a single `version` number.
- `migrations.ts` declares an ordered list of `{ toVersion, steps }` entries. Each step is `addColumns({ table, columns })` or `createTable({ name, columns })`.
- On app start, WatermelonDB compares the on-device schema version to `schema.ts`'s `version` and replays any migrations with `toVersion` greater than the stored version, in order.
- There is no `dropColumns`/`dropTable` step used in this codebase — the migration history is purely additive.

This gives the mobile app what the server lacks: automatic, versioned, replayable schema evolution with no manual `ALTER TABLE` step.

### Version-by-version history (v4 → v11)

| Version | Changes |
|---|---|
| v4 | Add `peers.email_verified` (boolean, optional) |
| v5 | Add `messages.updated_at`; add `conversations.updated_at`, `conversations.title`; create `message_receipts` (`message`, `user`, `status`, `updated_at`); create `calls` (`conversation`, `initiator`, `call_type`, `status`, `start_time`, `end_time`, `updated_at`); create `call_participants` (`call`, `user`, `joined_at`, `left_at`) |
| v6 | Add `message_receipts.created_at`, `message_receipts.is_deleted`; add `calls.created_at`, `calls.is_deleted`; add `call_participants.updated_at`, `call_participants.created_at`, `call_participants.is_deleted`; add `conversations.is_deleted`; add `conversation_participants.created_at`, `conversation_participants.updated_at` |
| v7 | Add `peers.phone_number_verified` (boolean, optional) |
| v8 | Add `messages.linked_message_id` (string, optional — reply-thread FK) |
| v9 | Add `peers.role` (string, optional); add `messages.is_encrypted` (boolean, optional) |
| v10 | Add `peers.is_guest` (boolean, optional) |
| v11 | Add `peers.last_seen_at` (number, optional) |

Versions 1–3 predate the current migration file (the schema for those versions is not recoverable from `migrations.ts`; only v4 onward is tracked).

### Known source quirk

`schema.ts`'s `peers` table declares `phone_number_verified` **twice** in its column list (an accidental duplicate entry). WatermelonDB does not error on this, but it is a defect in the source worth fixing separately — not a docs issue.

Contrast with the server: WatermelonDB's approach (versioned, additive, replayed automatically on client start) is exactly the discipline [the Alembic recommendation above](#recommendation-adopt-alembic) would bring to the server side.
