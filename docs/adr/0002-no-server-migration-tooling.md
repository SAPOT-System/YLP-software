# Server schema uses SQLModel `create_all()`, not a migration tool

**Status:** Accepted — expected to be superseded if/when the project adopts Alembic (see Consequences below); flip this line to `Superseded by <link>` when that happens.

## Context

The FastAPI server uses SQLModel/SQLAlchemy models as the schema source of truth. Schema changes need some mechanism to reach the running database. Options considered: adopt Alembic (SQLAlchemy's standard migration tool, with autogenerate, versioning, and up/down migrations) now, or defer it and apply schema changes by hand.

The project is early-stage with a small number of deployments (LAN incident-site installs, not a continuously-running multi-tenant service), and the team prioritized shipping feature work over migration infrastructure during initial development.

## Decision

Use SQLModel's `create_db_and_tables()` (→ SQLAlchemy `metadata.create_all()`) at server startup, which creates missing tables but never alters or drops existing ones. Schema changes to existing tables are applied manually with hand-written `ALTER TABLE` statements against the production database, with no tracking of which statements have been applied.

## Consequences

- **No schema version tracking, no rollback.** If a manual DDL change breaks production, there is no recorded migration to revert — see [migrations.md](../database/migrations.md#operational-implications) for the full risk table.
- **Deploy ordering is manual and error-prone.** Deploying updated server code without first applying the matching `ALTER TABLE` causes runtime errors (missing column, type mismatch). This must be sequenced by hand on every deploy that changes a model.
- **Contrast with the mobile app:** the mobile app's WatermelonDB uses a fully versioned, additive `schemaMigrations()` mechanism (see [migrations.md](../database/migrations.md#mobile-app-watermelondb)) that replays automatically on client start — the server intentionally does not have the equivalent discipline yet.
- **This is tracked as technical debt, not a permanent decision.** [migrations.md](../database/migrations.md#recommendation-adopt-alembic) recommends adopting Alembic; this ADR should be superseded once that happens.
