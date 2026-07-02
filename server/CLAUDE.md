# CLAUDE.md

Instructions for Claude Code working in `server/` — the SAPOT FastAPI backend. See root `../CLAUDE.md` first for repo-wide rules (component ownership, cross-component change coordination, generic safety rules); this file adds server-specific detail. For architecture/API/DB documentation, see `../docs/architecture/`, `../docs/api/`, `../docs/database/` — this file is instruction, not documentation.

## Stack (fact)

FastAPI + SQLModel, Python 3.13. Entry point `app/main.py` (mounted as `app.main:app`). Endpoints in `app/api/*.py`, one file per feature area (auth, gps, sync, admin, gsm, mikrotik, captive_portal, keys, wrapped_key, ...). DB access in `app/db_operations/*.py`. Models in `app/models/*.py`. Tests in `app/tests/` (pytest, `pytest.ini`: `testpaths = tests`). Rate limiting via `slowapi` (`app/limiter.py`). Deployed behind Nginx → Gunicorn/Uvicorn workers (`runserver.sh`); locally run with `uvicorn app.main:app --reload`.

No migration tooling exists (ADR 0002 in `../docs/adr/`) — schema changes are applied manually; see `../docs/database/migrations.md` before altering `app/models/`.

## Security History (fact — read before touching auth/secrets/db_operations)

`../SECURITY.md` records that hardcoded MariaDB credentials, a hardcoded JWT secret fallback, a CORS wildcard, and an always-mounted testing router were previously committed and had to be fixed and rotated. The current pattern this codebase relies on:

- `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS` are **required env vars** — the app raises `RuntimeError` at import time if any is unset. Do not add a default/fallback value for a secret or credential; that is the exact regression `SECURITY.md` documents.
- `app/api/testing.py` (`test-make-admin`, `test-make-rescuer`) is only imported/mounted when `ENVIRONMENT=development` (see the conditional import in `app/main.py`). Do not remove that gate or make those endpoints reachable in production.
- Before changing anything in `app/db_operations/auth.py`, `app/db_operations/token.py`, or CORS/rate-limit config, read `../SECURITY.md` in full — it is the canonical list of what "secure" means for this server, not a changelog to skim.

## Before Writing Code

- Check `../docs/api/conventions.md` for the shared response envelope, error shape, pagination (`fastapi-pagination`), and timestamp conventions (sync timestamps are epoch-ms, others ISO 8601) before adding or changing an endpoint — don't invent a new response shape per-endpoint.
- Find a comparable existing endpoint in `app/api/` and mirror its structure (dependency injection via `SessionDep`, rate-limit decorator usage, error handling) rather than writing a new pattern.
- Check `../docs/api/openapi/` for the currently-documented contract of an endpoint before changing its request/response shape — mobile and admin clients depend on it and won't be updated automatically (see root `CLAUDE.md`'s cross-component rule).

## While Writing Code

- New or changed endpoint: add/extend the matching rate limit if the route is auth- or account-mutation-related (see existing `@limiter.limit(...)` usage in `app/api/auth.py`, `app/api/forgot_password.py` for the pattern and existing per-endpoint limits documented in `../docs/api/conventions.md`).
- New required config: add it to `../docs/deployment/environment-config.md` and `.env.example` (never commit a real value) — the app should fail fast at import time if it's missing, matching the existing pattern.
- Schema change: update the SQLModel in `app/models/`, then update `../docs/database/tables.md` and `../docs/database/erd.md` by hand or via `../scripts/generate_db_docs.py` — do not hand-edit the generated doc without regenerating (CI checks for drift).
- API surface change: regenerate the OpenAPI fragment via `../scripts/generate_openapi_docs.py` — do not hand-edit files under `../docs/api/openapi/`.

## Verification

Run from `server/app/`:

```bash
pip install -r requirements.txt
pytest
```

If the API surface or DB schema changed, run from the **repo root** (not `server/app/`):

```bash
python3 scripts/generate_openapi_docs.py --check
python3 scripts/generate_db_docs.py --check
```

Both are enforced in CI (`.github/workflows/openapi-docs-check.yml`) on any push/PR touching `server/app/**`.

## Versioning

`app/version.py` (`__version__`) must match the git tag (`server/vX.Y.Z`) before a release — see `../VERSIONING.md`. Set it with `python3 scripts/set_version.py <X.Y.Z[-(alpha|beta|rc).N]>`, don't hand-edit `version.py`. This only matters when explicitly preparing a release, not for ordinary changes.

## Safety Rules

- Never add a default value for a required secret/credential env var (`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, etc.) — this repo has a documented incident from exactly that pattern.
- Never make `app/api/testing.py` reachable outside `ENVIRONMENT=development`.
- Never hand-edit `../docs/api/openapi/*.yaml`, `../docs/database/tables.md`, or `../docs/database/erd.md` — regenerate via the scripts above.
- Never hand-edit `app/version.py` — use `scripts/set_version.py`.
- `server/.env` is gitignored — never commit real secrets; use `server/.env.example` as the template.
