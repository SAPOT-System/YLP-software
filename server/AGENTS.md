# AGENTS.md — server

FastAPI backend for SAPOT: the central API, database, auth, and integration hub for the mobile app, admin dashboard, GSM SMS gateway, and MikroTik router. See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

- Environment: Nix flake (`flake.nix`/`flake.lock`) is the primary way to get a matching toolchain, or `pip install -r app/requirements.txt` directly.
- Required env vars must be set before the app will start — it raises `RuntimeError` at import time otherwise: `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`. See `docs/deployment/environment-config.md`.
- Prod entry point: `runserver.sh` — creates a `uv` venv, installs `app/requirements.txt`, runs `gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 5 -b 127.0.0.1:8000`.
- TODO: no documented local dev-server command (e.g. `uvicorn app.main:app --reload`) was found in this directory — confirm with a maintainer before assuming one.

## Build

No build step — this is an interpreted Python service; `runserver.sh` handles venv setup and process launch for production.

## Test

- `pytest`, config at `app/pytest.ini` (`testpaths = tests`), tests in `app/tests/`.
- Coverage: `pytest-cov`. Parallel runs: `pytest-xdist`. Output formatting: `pytest-sugar`.
- Run from `server/app/`: `pytest --cov`.

## Lint / Format

No linter or formatter is configured for this project — no `pyproject.toml`, `ruff.toml`, `.flake8`, or `setup.cfg` exists here. Match the existing style in the file you're editing; don't introduce a new tool without asking.

## Framework Expectations

- Route modules live under `app/api/`, one file per domain (auth, sync, gps, gsm, mikrotik, captive_portal, peer_connection, websocket, etc.) — add new endpoints as a new or existing domain module, not inline in `main.py`.
- Data models use SQLModel/SQLAlchemy; no migration tool (Alembic or similar) was found in this directory — TODO: confirm with a maintainer how schema changes are rolled out to the running MariaDB instance before altering a model.
- `app/version.py` (`__version__`) is the single source of truth for the server's release version — only change it via `server/scripts/set_version.py` / the root `scripts/release.sh` flow, never by hand.
- The `/testing/*` router (`app/api/testing.py`) is gated behind `ENVIRONMENT=development` — don't remove that gate, and don't rely on those endpoints being reachable in any other environment.

## Do Not Edit Manually

- `docs/api/openapi/*` and `docs/database/{tables,erd}.md` — generated from this codebase by `scripts/generate_openapi_docs.py` / `scripts/generate_db_docs.py` (checked for drift in CI). Change the source (routes/models) and regenerate instead.
- `app/version.py`'s `__version__` — set only via the versioning tooling.

## Common Pitfalls

- Forgetting a required env var (`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`) locally — the app fails fast with a clear error rather than falling back to an insecure default; this is intentional, don't reintroduce a fallback.
- Editing a route's request/response shape without checking `docs/api/openapi/**` drift — CI (`openapi-docs-check.yml`) will fail the PR if the generated docs aren't regenerated.
- Assuming `mobile-app/` or `admin-frontend/` can be edited to work around a server change — if a task starts in one of those and needs a server change, treat it as a server change and update this project directly, then update the callers.

## Validation Checklist

- [ ] `pytest --cov` passes from `server/app/`
- [ ] New/changed endpoints have corresponding tests in `app/tests/`
- [ ] `docs/api/openapi/**` and `docs/database/*.md` regenerated if `app/api/**` or models changed
- [ ] No hardcoded secret/default reintroduced for `DATABASE_URL`, `JWT_SECRET_KEY`, or `CORS_ALLOWED_ORIGINS`
