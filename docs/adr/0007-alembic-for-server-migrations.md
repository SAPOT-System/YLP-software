# Server schema uses Alembic migrations, not `create_all()`

**Status:** Accepted — supersedes [ADR 0002](0002-no-server-migration-tooling.md)

## Context

[ADR 0002](0002-no-server-migration-tooling.md) deferred migration tooling and applied schema changes by hand, on the reasoning that the project was early-stage with few deployments. The consequences it predicted then materialized:

- `message.content` was declared `VARCHAR(255)`, which a 2000-char plaintext message and E2E-encrypted base64 ciphertext both overflow. `/sync/push` failed with a generic 500. Fixing it needed a hand-written `ALTER TABLE` that no deployment record tracked (issue #174).
- `callparticipant.call_id` pointed its foreign key at `conversation.id` instead of `call.id`. Against a real database this either violated the FK or stored the wrong id (issue #270).

Both are exactly the "creates missing tables but never alters existing ones" gap. Neither could be applied reliably, because nothing recorded which databases had already received which `ALTER TABLE`. The deferral also had no exit condition: there was no mechanism that would ever notice the models and the database had diverged.

## Decision

Adopt [Alembic](https://alembic.sqlalchemy.org/) as the single source of truth for server schema.

- Configuration lives in `server/alembic.ini` (`script_location = %(here)s/app/alembic`, `prepend_sys_path = .`), environment in `server/app/alembic/env.py`, which reads `DATABASE_URL` and fails fast if it is unset.
- A baseline migration (`39d8921c6309_baseline_schema.py`) creates all 38 table models.
- `create_db_and_tables()` is removed from the FastAPI `lifespan` in `server/app/main.py`. The app no longer creates schema at startup.
- `server/runserver.sh` runs `alembic upgrade head` as a deploy step before the app starts.
- `app/models/__init__.py` imports every table model, so `SQLModel.metadata` is fully populated before autogenerate runs. Fourteen models were previously missing from it.
- CI (`.github/workflows/migration-check.yml`) runs `alembic upgrade head`, `alembic check`, and `alembic downgrade base` against MySQL 8.0 on every change under `server/app/**`.

## Consequences

- **Schema changes are versioned and reviewable.** Each change is a file in `app/alembic/versions/`, and `alembic_version` records what any given database has applied.
- **Model/migration drift is caught mechanically.** `alembic check` fails CI when a model changes without a matching migration. This matters because the test suite builds its schema from `SQLModel.metadata.create_all()` (`app/tests/conftest.py`) and therefore cannot see migration drift. CI is the only guard.
- **CI runs against MySQL, not SQLite, deliberately.** Some failures are dialect-specific. The baseline's generated `downgrade()` dropped foreign-key-backing indexes before their tables, which succeeds on SQLite but fails on MySQL with error 1553 and leaves the database half-torn-down. SQLite-only verification would have shipped that.
- **Existing databases need a one-time cutover, not `upgrade`.** A database created by the old `create_all()` path has the tables but no `alembic_version`. Running `alembic upgrade head` against it tries to re-create existing tables and fails. Such databases must be brought level with the baseline by hand and then `alembic stamp head`-ed. See [migrations.md](../database/migrations.md#one-time-cutover-for-existing-databases).
- **Downgrading the baseline drops every table.** It exists to verify the migration reverses cleanly in CI against a throwaway database. It is not a production rollback procedure; restoring from backup is (see [runbooks.md](../deployment/runbooks.md)).
- **The mobile app and server now have comparable discipline.** [ADR 0003](0003-watermelondb-for-mobile-local-database.md) notes WatermelonDB gives the mobile app versioned, replay-on-start migrations. The server's equivalent is a deploy-time `alembic upgrade head` rather than a client-start replay, but both are now versioned and tracked.
