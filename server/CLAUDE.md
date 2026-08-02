# CLAUDE.md — server

Instructions for Claude Code working in `server/` — the SAPOT FastAPI backend. See root `../CLAUDE.md` for repo-wide rules (component ownership, cross-component coordination); this file is project-specific. For architecture/API/DB documentation, see `../docs/architecture/`, `../docs/api/`, `../docs/database/` — this file is instruction, not documentation.

## Project Overview

FastAPI + SQLModel backend, Python 3.13. Provides auth, sync, WebSocket signalling relay (for mobile P2P calls), GPS streaming, admin/user management, GSM (SMS gateway) proxying, and MikroTik router telemetry. Deployed behind Nginx → Gunicorn/Uvicorn workers (`runserver.sh`); coordinates but doesn't relay chat messages themselves (mobile clients exchange those P2P or via the WS relay for signalling only).

## Architecture

Entry point `app/main.py` (mounted as `app.main:app`). Request flow: Nginx (TLS) → Gunicorn/Uvicorn workers → FastAPI app → `SlowAPIMiddleware` (rate limiting) → activity-tracking middleware → route handler (`app/api/*.py`) → `SessionDep` (DB session dependency, `app/db_operations/auth.py`) → SQLModel query against MariaDB.

- One router module per feature area in `app/api/`: `auth`, `gps`, `sync`, `admin`, `gsm`, `mikrotik`, `captive_portal`, `keys`, `wrapped_key`, `user_keys`, `peer_connection`, `public_chat`, `profile_picture`, `download`, etc. `app/api/testing.py` is conditionally imported only when `ENVIRONMENT=development` (see `app/main.py`).
- `app/db_operations/*.py` holds DB-facing logic (auth/session handling, GPS manager, sync tokens, router client/metrics, key recovery, etc.) — route handlers call into these rather than querying models directly.
- `app/models/*.py` — one SQLModel per file (users, messages, calls, keys, recovery, router, captive_portal, etc.).
- Rate limiting is a cross-cutting concern via `slowapi` (`app/limiter.py`, `@limiter.limit(...)` decorators on individual routes) — not middleware-only, it's applied per-endpoint.
- Schema is Alembic-managed (ADR 0007 in `../docs/adr/`) — editing `app/models/` requires a matching migration in `app/alembic/versions/`; see `../docs/database/migrations.md`.

## Directory Guide

- `app/api/` — route handlers, one file per feature area. Where new endpoints go.
- `app/db_operations/` — DB-facing business logic called by route handlers (session/auth, GPS, sync tokens, router telemetry, key recovery).
- `app/models/` — SQLModel table definitions.
- `app/tests/` — pytest suite (`pytest.ini`: `testpaths = tests`); includes dedicated regression tests (`test_security_regression.py`, `test_ip_lockout.py`, `test_recovery_ip_lockout.py`) for past incidents — see Common Pitfalls.
- `app/limiter.py` — shared `slowapi` limiter instance.
- `app/version.py` / `app/version_writer.py` / `scripts/set_version.py` — release versioning (see Versioning below).
- `static/` — served directly by Nginx in production (profile pictures), not by the Python app.

## Key Concepts

- **Fail-fast required config.** `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS` are required env vars — the app raises `RuntimeError` at import time if any is unset. This is a deliberate pattern (see Security History), not an oversight — new required secrets should follow the same fail-fast approach, never a default value.
- **JWT auth + role resolution.** Most endpoints require a Bearer JWT (obtained via `POST /auth/token`, OAuth2 password flow — the `username` field is actually the user's email). Role-gated endpoints require `rescuer` or `admin`, resolved server-side from the JWT `sub` claim (user UUID) — see `../docs/architecture/security-architecture.md`.
- **Per-endpoint rate limits**, not global — auth and account-mutation endpoints carry specific `@limiter.limit(...)` decorators (documented per-endpoint in `../docs/api/conventions.md`). Login attempts are additionally tracked per `(user, IP)` with progressive lockout, independent of the slowapi decorator.
- **Shared-secret webhook auth for GSM.** `app/api/gsm.py` proxies to the GSM-module service (see `../GSM-module/CLAUDE.md`) using an `X-GSM-Secret` header — a different auth model from the JWT scheme used everywhere else, because the caller there is a co-located service, not an end-user client.
- **Alembic-managed schema** (ADR 0007) — run `alembic` from `server/`, not `server/app/`; `alembic.ini` sets `prepend_sys_path = .`, so `app` is importable only from there. A new model file must be imported in `app/models/__init__.py` or autogenerate will omit its table. Always review autogenerate output before committing.

## Development Conventions

- New/changed endpoint: mirror an existing route in `app/api/` for `SessionDep` usage, rate-limit decorator placement, and error handling rather than inventing a new shape. Match the response envelope/error/pagination conventions in `../docs/api/conventions.md`.
- New required config: add it to `../docs/deployment/environment-config.md` and `.env.example` (never a real value) — follow the fail-fast-at-import pattern, not a default.
- Schema change: update the SQLModel in `app/models/`, then regenerate `../docs/database/tables.md` / `erd.md` via `../scripts/generate_db_docs.py` rather than hand-editing them (CI checks for drift).
- API surface change: regenerate the OpenAPI fragment via `../scripts/generate_openapi_docs.py` rather than hand-editing `../docs/api/openapi/`.
- Both docs-generation checks run from the **repo root**, not `server/app/`: `python3 scripts/generate_openapi_docs.py --check`, `python3 scripts/generate_db_docs.py --check` (enforced in `.github/workflows/openapi-docs-check.yml`).

## Important Files

- `app/main.py` — app assembly: middleware order, conditional dev-only router mount, all router registration.
- `app/limiter.py` — shared rate limiter instance used by `@limiter.limit(...)` across `app/api/`.
- `app/db_operations/auth.py` — `SessionDep`, session/auth plumbing used by nearly every route.
- `app/version.py` — release version, must match git tag on release (see Versioning).
- `../SECURITY.md` — canonical list of this server's security-relevant history and required configuration.

## Common Pitfalls

- Adding a default/fallback value for a required secret env var — this repo has a documented incident (hardcoded DB credentials, hardcoded JWT secret fallback, CORS wildcard) that this fail-fast pattern exists specifically to prevent. See `../SECURITY.md`.
- Making `app/api/testing.py` reachable outside `ENVIRONMENT=development` — it's conditionally imported in `app/main.py` specifically to keep `test-make-admin`/`test-make-rescuer` out of production.
- Hand-editing `../docs/api/openapi/*.yaml`, `../docs/database/tables.md`, or `../docs/database/erd.md` — these are generated; CI fails on drift between them and the source.
- Hand-editing `app/version.py` instead of using `./scripts/release.sh server <version>` (repo root) — `scripts/set_version.py` alone bumps the file but skips the commit/tag/release-notes steps.
- Changing an endpoint's request/response shape without checking `../docs/api/openapi/` and the mobile/admin clients that depend on it — this server has no consumers of its own; both other components assume the current contract.
- Assuming `app/api/gsm.py` talks to `GSM-module/GSM-API/` — it does not; the live GSM service is `GSM-module/GSM-fastapi/` (port 8001). See `../GSM-module/CLAUDE.md`.

## When Modifying This Project

- Auth/token/session changes (`app/db_operations/auth.py`, `app/db_operations/token.py`) and CORS/rate-limit config changes: read `../SECURITY.md` in full first, and run `app/tests/test_security_regression.py`, `test_ip_lockout.py`, `test_recovery_ip_lockout.py` specifically — these encode past incidents.
- Endpoint/schema changes: regenerate and check both doc sets (OpenAPI, DB docs) per Development Conventions, and flag the change as cross-component in your summary since mobile and admin clients are not updated automatically (see root `CLAUDE.md`).
- Release prep: `app/version.py` must match the intended git tag (`server/vX.Y.Z`). **Use the repo-root entry point, `./scripts/release.sh server <X.Y.Z[-(alpha|beta|rc).N]>`** — it bumps the version, commits, drafts release notes, and creates the annotated tag in one step; see `../VERSIONING.md`. `scripts/set_version.py` (`server/scripts/`) is an internal step `release.sh` calls — running it standalone leaves the bump uncommitted and untagged. Not relevant to ordinary feature/bugfix work.
- Run `pytest` (from `server/app/`) for any change. If you touched `app/models/`, also run `alembic upgrade head && alembic check` from `server/` — `pytest` builds its schema via `SQLModel.metadata.create_all()` in `app/tests/conftest.py`, so it cannot detect a migration that has fallen behind the models.
