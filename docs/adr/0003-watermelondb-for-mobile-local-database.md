# Use WatermelonDB for the mobile app's local database

**Status:** Accepted

## Context

SAPOT's mobile app must work fully offline on a LAN with no internet, and must treat the local database as the primary source of truth for messages (see [system-overview.md](../architecture/system-overview.md#system-boundaries)) rather than a cache of server state. This requires: fast local reads/writes for chat-scale data volumes, an observable/reactive query layer for React components, and an incremental sync model against a REST API rather than a real-time cloud sync backend.

Candidates considered: plain `expo-sqlite` with hand-written queries, Realm, and WatermelonDB (SQLite-backed, lazy-loading, reactive observation via RxJS-style observables, built-in sync primitives).

## Decision

Use WatermelonDB (SQLite under the hood) as the mobile app's local database, with a versioned `appSchema()` and `schemaMigrations()` for schema evolution (see [migrations.md](../database/migrations.md#mobile-app-watermelondb)).

## Consequences

- **Reactive UI for free.** Components observe WatermelonDB queries directly; new messages/calls/GPS updates re-render without a separate state-management layer for server-derived data.
- **Built for offline-first sync.** WatermelonDB's design assumes a local-first app syncing against a remote API (pull/push, `lastPulledAt` cursors), which matches SAPOT's [incremental sync design](../features/sync/design.md) directly rather than requiring the sync layer to be built from scratch on top of a generic SQLite wrapper.
- **Versioned, additive migrations.** `schemaMigrations()` gives the mobile app automatic, replay-on-start schema evolution (`addColumns`/`createTable` steps) — a discipline the server intentionally does not have yet (see [ADR 0002](0002-no-server-migration-tooling.md)).
- **Constraint accepted:** migrations in this codebase are purely additive — no `dropColumns`/`dropTable` step is used, which means dead columns accumulate in the schema rather than being cleaned up (e.g. the known `phone_number_verified` duplicate-declaration quirk noted in [migrations.md](../database/migrations.md#known-source-quirk)). This is an accepted cost of avoiding destructive migrations on user devices where a bad migration cannot be rolled back remotely.
