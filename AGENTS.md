# AGENTS.md

Guidance for AI coding assistants working in this repository. Read this before making changes anywhere in the tree.

## Project Overview

**SAPOT** is a local-first, LAN-based disaster-response communications platform: offline-capable messaging, voice/video calls, GPS tracking, and SMS fallback via a GSM gateway, plus an admin/rescuer web dashboard. It is designed to run entirely on a local network (e.g. via a MikroTik router) without internet dependency.

**Monorepo tool: none.** This is a **polyrepo-in-one-repo** — multiple independently managed projects living under one git root, coordinated by convention (docs, `CONTRIBUTING.md`, `VERSIONING.md`) and by network APIs (REST/WebSocket), not by any JS workspace tool. There is no `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`, or `workspaces` field anywhere in the repo (verified). There is no root `package.json` — `scripts/release-notes.mjs` runs on Node builtins only (shells out to the `claude` CLI directly) and needs no `node_modules`. Each JS/TS project has its own `node_modules` and lockfile:
- `admin-frontend/sapot-admin` — pnpm (`pnpm-lock.yaml`)
- `mobile-app/sapot-mobile-app` — **pnpm** (`pnpm-lock.yaml`)

High-level architecture: `server/` (Python/FastAPI) is the integration hub. `mobile-app/` and `admin-frontend/` are clients that talk to it over REST/WS. `GSM-module/` is a separate FastAPI service that the server calls over HTTP to send/receive SMS via a GSM modem. `captive-portal/` is static HTML served directly by the MikroTik router (not by any app server). `tileserver/` is a standalone Docker-based map-tile server consumed by both frontends.

## Repository Layout

| Directory | What it is |
|---|---|
| `server/` | Python/FastAPI backend — the central API, database, auth, and integration hub |
| `mobile-app/sapot-mobile-app/` | React Native (Expo) app — the primary end-user deliverable |
| `admin-frontend/sapot-admin/` | Next.js 16 (App Router) admin/rescuer web dashboard |
| `GSM-module/` | SMS gateway: Arduino firmware + two parallel Python/FastAPI services |
| `captive-portal/` | Static HTML/JS pages served by the MikroTik router (WISPr hotspot login) |
| `tileserver/` | Shell scripts that run `maptiler/tileserver-gl` in Docker for offline map tiles |
| `scripts/` | Root-level release tooling and doc generators (Node + Python) |
| `deployment-scripts/` | systemd `.service` unit files for production deployment |
| `docs/` | Canonical, actively-maintained documentation (architecture, API, DB, deployment, features, ADRs) — see `docs/README.md` as the index |
| `diagrams/`, `READMEMEDIA/` | Diagram sources and README media assets |
| `.github/workflows/` | CI: mobile Expo build, OpenAPI/DB doc-drift check, mobile/server release-tag workflows |

**Note:** `.github/worflows/` (missing the "k") also exists with `eas-production.yml`, `eas-preview.yml`, and a duplicate `expo-android-ci.yml`. GitHub Actions only reads `.github/workflows/`, so this directory is **not live CI** — treat it as a stale/orphaned leftover, not a deployment path to edit.

### Per-project detail

**`server/`** — FastAPI + SQLModel/SQLAlchemy over MariaDB (`PyMySQL`), Redis, `slowapi` rate limiting, `pwdlib`/argon2 password hashing, PyJWT, RouterOS-api for MikroTik integration. Nix-flake managed; plain `requirements.txt` (no Poetry). ~21 route modules in `app/api/` (auth, sync, gps, gsm, mikrotik, captive_portal, peer_connection, websocket, etc.). Versioning source of truth: `app/version.py` (`__version__`), bumped only via `server/scripts/set_version.py`. Prod runs via `runserver.sh` (gunicorn+uvicorn, 5 workers). Has no `AGENTS.md`/`CLAUDE.md` of its own — `mobile-app`'s `CLAUDE.md` explicitly treats it as **read-only reference**, don't edit it casually from the mobile-app context.

**`mobile-app/sapot-mobile-app/`** — Expo SDK ~54, React Native + TypeScript, pnpm. Feature-based structure: `features/<name>/{services,repositories,hooks,components,types.ts,index.ts}` for `announcements, auth, call, chat, getting-started, gps, settings, shared, sync`. Local persistence: WatermelonDB (SQLite, schema v10). E2E crypto via `tweetnacl`/`@noble/hashes`/`expo-crypto`. Talks to `server/` over REST+WS with three transport modes (auto/server/LAN) and to `tileserver/` for offline tiles. **Has its own detailed `CLAUDE.md`** — read it before touching this directory; it covers DI containers, service map, doc-sync obligations, and a Definition-of-Done checklist, and is authoritative over anything more general stated here. Note: that file references several named "skills" (`app-commands`, `crypto-architecture`, `gps-architecture`, `dev-logging`) — these may not be available in every AI coding harness; if yours doesn't have them, fall back to reading the corresponding `docs/*.md` file directly instead of treating their absence as an error.

**`admin-frontend/sapot-admin/`** — Next.js 16 (App Router), React 19, TypeScript, pnpm. Uses `maplibre-gl`, `recharts`, Dexie (IndexedDB), `tweetnacl` for client crypto. `app/api/*` route handlers proxy roughly 25 `server/` endpoints. Has its own narrow `AGENTS.md` (a Next.js-16 breaking-changes warning: read `node_modules/next/dist/docs/` before coding) and a `CLAUDE.md` that imports it — follow that file when working here.

**`GSM-module/`** — Two parallel FastAPI services implementing the SMS path: phone → GSM modem → Arduino bridge → USB serial → GSM FastAPI service → `server/`.
- `GSM-fastapi/` is the **currently deployed** service (per `deployment-scripts/server-GSM-api.service`, which runs `GSM-fastapi/run-api.sh`). Flat script layout, nix flake, `requirements.txt`.
- `GSM-API/` is a newer, in-progress restructure (proper `app/` package) **not yet wired into deployment** — don't assume it's live.
- `GSM-arduino-actual-code/`, `GSM-trial-code/` are Arduino `.ino` sketches.
- Known open security gap (see `SECURITY.md`): `GSM-fastapi/config.py` has a hardcoded default DB path.

**`captive-portal/`** — No package.json, no build step. Static WISPr-compliant hotspot pages (`login.html`, `logout.html`, `status.html`, `redirect.html`, `error.html`) plus a RouterOS-templated `api.json` (uses RouterOS `$(...)` syntax — don't "fix" this thinking it's broken JS/JSON). Served directly by the MikroTik router.

**`tileserver/`** — Not a codebase. Two shell scripts (`deploy-tiling-server.sh`, `deploy-tiling-server-detached.sh`) that `docker run` `maptiler/tileserver-gl` against a `.mbtiles` file that is not committed to the repo.

## Workspace Dependencies

- **No shared code exists between top-level projects.** There is no `libs/`, `packages/`, or top-level `shared`/`common` directory. The only `shared` folder in the repo is `mobile-app/sapot-mobile-app/features/shared/`, which is an internal feature-module convention, not cross-project shared code.
- **No cross-project relative imports** exist (verified by search) — all integration between projects happens over the network (REST/WebSocket/HTTP), never via shared source files.
- Dependency direction, as network calls:
  - `mobile-app/` and `admin-frontend/` → `server/` (REST + WS)
  - `mobile-app/` and `admin-frontend/` → `tileserver/` (map tiles)
  - `server/` → `GSM-module/GSM-fastapi/` (HTTP, SMS send/receive)
  - `server/` → MikroTik router (RouterOS API, for `mikrotik.py`/`captive_portal.py`)
  - MikroTik router → serves `captive-portal/` static files directly (the app server never serves these)
- **Layering rule (inferred from `mobile-app/CLAUDE.md`):** `server/` is treated as read-only reference from client codebases — don't modify it to satisfy a mobile-app or admin-frontend need without explicit review; change the client's integration code instead, or flag the needed server change separately.
- `scripts/release.sh` is the one piece of tooling that spans subprojects (it bumps `mobile-app/sapot-mobile-app/package.json` or `server/app/version.py`), but it does so via shell/git, not a JS workspace mechanism — do not read this as evidence of shared tooling elsewhere.

## Tech Stack

Different workspaces use genuinely different stacks — there is no unified stack:

| Project | Stack |
|---|---|
| `server/` | Python, FastAPI, SQLModel/SQLAlchemy, MariaDB, Redis, PyJWT, argon2, RouterOS-api, Nix flake |
| `mobile-app/` | TypeScript, React Native, Expo SDK ~54, WatermelonDB (SQLite), pnpm |
| `admin-frontend/` | TypeScript, Next.js 16 (App Router), React 19, Dexie, pnpm |
| `GSM-module/` | Python, FastAPI, pyserial, SQLModel, Nix flake; plus Arduino C/C++ firmware |
| `captive-portal/` | Static HTML/CSS/JS, RouterOS template syntax |
| `tileserver/` | Shell scripts + Docker (`maptiler/tileserver-gl`) |
| `scripts/` (root) | Node (release-notes generation via `@anthropic-ai/sdk`) + Python (doc generators) |

## Development Commands

There is **no repo-level install/build/test command** that spans all projects — each subproject is built, run, and tested independently from within its own directory. Exact install/build/test/lint commands are documented once, in each project's own `AGENTS.md` — see `server/AGENTS.md`, `mobile-app/sapot-mobile-app/AGENTS.md`, `admin-frontend/sapot-admin/AGENTS.md`, `GSM-module/AGENTS.md`, `scripts/AGENTS.md` — rather than repeated here. Two things worth knowing before you open any of them:
- `mobile-app/sapot-mobile-app/` uses **pnpm** as its declared package manager, but some of its own scripts/docs invoke `npm run ...` internally — both toolchains need to be available. Full detail in that project's `AGENTS.md`.
- `admin-frontend/sapot-admin/` has no test framework configured at all — don't assume one exists there.

## Working in a Monorepo (Polyrepo)

- Identify the correct project directory before making any change — there is no shared build graph to catch cross-project breakage automatically.
- Do not add a shared `libs/`/`packages/` directory speculatively; none exists today, and cross-project communication is deliberately network-based, not code-shared.
- Do not create cross-project relative imports (e.g. `mobile-app` importing from `server`) — this repo's architecture intentionally avoids that.
- Treat `server/` as read-only from `mobile-app/` and `admin-frontend/` unless the task is explicitly a server change — the mobile app's `CLAUDE.md` states this boundary explicitly.
- Respect each project's own package manager: pnpm for both `admin-frontend` and `mobile-app`. There is no root `package.json`. Don't mix lockfiles or run the wrong install command in the wrong directory.
- When a task touches an API contract (e.g. a `server/app/api/*` route), update the calling code in `mobile-app`/`admin-frontend` in the same change, and check whether `docs/api/openapi/` or `docs/database/*.md` need regeneration (`scripts/generate_openapi_docs.py`, `scripts/generate_db_docs.py`) — CI (`openapi-docs-check.yml`) checks these for drift.
- Check for and read a project-local `AGENTS.md`/`CLAUDE.md` before working in `admin-frontend/sapot-admin/` or `mobile-app/sapot-mobile-app/` — both exist and take precedence over the general guidance in this file for their subtree.
- Do not edit `app.config.ts` version fields in `mobile-app/` by hand — they're synced by `set-version.js` per `VERSIONING.md`.

## Architecture

- `server/` is the single integration hub: all client-facing state (auth, sync, GPS, messaging metadata, peer connections, websocket pool) lives there.
- `mobile-app/` and `admin-frontend/` are independent client apps against the same server API; they do not share a component library or types package.
- `GSM-module/GSM-fastapi/` is a secondary service reached only from `server/`, never directly from clients.
- `captive-portal/` and `tileserver/` are infrastructure-adjacent, non-application-server pieces the router and clients hit directly.
- Data flow for SMS: modem → Arduino (dumb serial bridge, no logic) → `GSM-fastapi` (protocol/session handling) → `server/app/api/gsm.py` → normal app data model.
- Data flow for network access: device → MikroTik hotspot → `captive-portal/` static pages (WISPr) → `server/app/api/captive_portal.py` / `mikrotik.py` for auth/session handling via RouterOS API.
- E2E encryption keys are handled client-side in both `mobile-app` (`tweetnacl`/`@noble/hashes`) and `admin-frontend` (`tweetnacl`) — the server is not assumed to see plaintext for encrypted content; check `docs/features/e2e-encryption/` before changing anything touching keys or ciphertext.

## Coding Conventions

Conventions differ by project; there is no repo-wide linter/formatter config at the root.

- **Branching/commits** (repo-wide, from `CONTRIBUTING.md`): `main` is protected, no direct commits. Branch names: `feature/<desc>`, `bugfix/<desc>`, `chore/<desc>`. Conventional-commit-style messages (`type(scope): summary`). Rebase onto `main` before pushing; never force-push `main`.
- **`server/`**: standard FastAPI/SQLModel route-module-per-domain layout under `app/api/`; env-driven config (see Configuration section) with fail-fast behavior on missing required secrets.
- **`mobile-app/`**: feature-folder convention (`features/<name>/{services,repositories,hooks,components,types.ts,index.ts}`) — follow this shape for new features rather than inventing a new structure. Full conventions are documented in `mobile-app/sapot-mobile-app/CLAUDE.md`; defer to it.
- **`admin-frontend/`**: Next.js App Router conventions, path alias `@/*` per `tsconfig.json`; `app/api/*` route handlers act as thin proxies to `server/` endpoints — keep new proxy routes similarly thin rather than adding business logic client-side.
- **`GSM-module/`**: `GSM-fastapi/` uses a flat script layout (legacy/deployed); `GSM-API/` uses a proper `app/` package layout (newer, in-progress) — match whichever directory you're editing rather than importing conventions from the other.

### Formatting

No formatter is configured anywhere in this repo (verified): no `.prettierrc*`/`prettier.config*` exists for any JS/TS project, and no `pyproject.toml`/`ruff.toml`/`.flake8`/`setup.cfg` exists for `server/` or `GSM-module/`. Match the surrounding file's existing style by hand; don't invent a Prettier/Black/Ruff invocation or assume a formatter will run in CI — none does.

## Testing

No single repo-wide test command exists; each project is tested independently.

- **`server/`**: `pytest`, config in `server/app/pytest.ini` (`testpaths = tests`), tests in `server/app/tests/` — 16+ files covering auth, sync, GPS, websocket pool, security regression, IP lockout, password reset, versioning. Coverage via `pytest-cov`; `pytest-xdist` for parallelism. No linter (ruff/flake8) or formatter (black) is configured for this project — verified no config file exists.
- **`mobile-app/`**: Jest with `jest-expo` preset (`pnpm test`). `pnpm testAll` bundles test + typecheck + lint + `expo-doctor` — treat this as the completion gate for mobile-app changes.
- **`admin-frontend/`**: no test framework currently configured — don't assume tests exist or invent a test command that isn't in `package.json`.
- **`scripts/`**: `scripts/__tests__/release-notes.test.mjs` covers the release-notes generator.
- **`GSM-module/`, `captive-portal/`, `tileserver/`**: no test tooling found.

## Configuration

- **Root**: `cliff.toml` (changelog generation config for `scripts/release.sh`); no root `package.json` (see Project Overview).
- **`server/`**: `flake.nix`/`flake.lock` (Nix env), `requirements.txt`, `nginx.conf`/`mysqld.cnf` (deployment reference), `app/pytest.ini`. Required env vars (per `SECURITY.md`): `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `ENVIRONMENT` (gates the testing router) — server fails fast if these are unset in production.
- **`mobile-app/sapot-mobile-app/`**: `pnpm-lock.yaml`, `tsconfig.json`, ESLint config, `app.config.ts` (version fields auto-synced — don't hand-edit), extensive `docs/` (ARCHITECTURE.md, API.md, DATABASE.md, SYNC.md, ENV_CONFIG.md, TESTING.md, etc.) plus `CLAUDE.md` — all project-specific, not shared with other projects.
- **`admin-frontend/sapot-admin/`**: `pnpm-lock.yaml`, `tsconfig.json` (`@/*` alias), `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `middleware.ts`, `.env.example` (`API_DOMAIN`, `NEXT_PUBLIC_WEBSOCKET_DOMAIN`, `NEXT_PUBLIC_MAP_STYLE`).
- **`GSM-module/GSM-fastapi/`**: `flake.nix`/`.envrc`, `requirements.txt`, `config.py` (has a known hardcoded default DB path — see Security note below; don't assume this is intentional/safe to copy elsewhere).
- **`GSM-module/GSM-API/`**: `flake.nix`, `pyrightconfig.json` — WIP, not deployed.
- **`.github/workflows/`**: `expo-android-ci.yml` (mobile PR checks/build, uses `pnpm/action-setup`), `openapi-docs-check.yml` (fails on doc drift for `server/app/**` changes), `release-mobile.yml` / `release-server.yml` (tag-triggered releases, assert version-file/tag match).
- **`deployment-scripts/`**: systemd `.service` units (`server-main-api.service`, `server-GSM-api.service`, `tileserver.service`) — these are the actual production wiring; e.g. they confirm `GSM-fastapi` (not `GSM-API`) is the deployed GSM service.

## Files to Avoid Editing

- `GSM-module/GSM-fastapi/sapot.db` — a checked-in SQLite database file; treat as generated/environment data, not source.
- `mobile-app/sapot-mobile-app/pnpm-lock.yaml`, `admin-frontend/sapot-admin/pnpm-lock.yaml` — regenerate via the package manager, don't hand-edit.
- `mobile-app/sapot-mobile-app/app.config.ts` version fields — synced automatically by `set-version.js`; hand-editing will be overwritten or cause a version mismatch.
- `docs/api/openapi/*` and `docs/database/{tables,erd}.md` — generated by `scripts/generate_openapi_docs.py` / `scripts/generate_db_docs.py`; edit the source (server routes/models) and regenerate, don't hand-edit the generated docs.
- `.github/worflows/` (typo'd directory) — not live CI; don't add new workflows here expecting them to run, and treat existing content as a cleanup candidate rather than something to extend.
- `captive-portal/api.json` — uses RouterOS `$(...)` template syntax intentionally; it is not valid standalone JSON and shouldn't be "fixed" to be so.

## AI Agent Guidelines

- Identify the correct top-level project directory before making changes — there is no shared build or type-check graph that will catch a change made in the wrong place.
- Before writing new code, check whether the target project (`server/`, `mobile-app/`, `admin-frontend/`, `GSM-module/`) already has an equivalent utility, service, or route — search within that project first; do not assume anything is shared across projects, because nothing is.
- Do not introduce a new cross-project shared code path (relative import, symlink, or copied file) — this repo's architecture is deliberately network-decoupled; if two projects truly need the same logic, that's a decision for the user, not something to infer and implement.
- Keep changes scoped to the affected project(s). A server API change plus its corresponding client update is expected to span `server/` + `mobile-app/`/`admin-frontend/`; an unrelated third project should not be touched.
- If you change a `server/app/api/*` contract, update both client callers and consider regenerating OpenAPI/DB docs (CI enforces this for `server/app/**` changes).
- Every top-level project has its own `AGENTS.md` — `server/`, `mobile-app/sapot-mobile-app/`, `admin-frontend/sapot-admin/`, `GSM-module/`, `captive-portal/`, `tileserver/`, `scripts/`, `deployment-scripts/`. Read the one for the directory you're working in before making changes; it takes precedence over this file for anything project-specific. `mobile-app/sapot-mobile-app/` and `admin-frontend/sapot-admin/` also have a `CLAUDE.md` with deeper architecture detail — Claude Code loads this automatically, but read it manually if you're a different agent, before large changes there.
- Follow `CONTRIBUTING.md` branch-naming and commit-message conventions repo-wide.
- Follow `VERSIONING.md` — mobile and server version independently via git tags (`mobile/vX.Y.Z`, `server/vX.Y.Z`); never hand-bump version fields outside the documented tooling.

## Workspace Notes

Entry points and per-project pitfalls now live in each project's own `AGENTS.md` (see the list in "AI Agent Guidelines" above). Quick orientation only:

| Project | Entry point |
|---|---|
| `server/` | `app/main.py` |
| `mobile-app/sapot-mobile-app/` | Expo Router app root (see `CLAUDE.md`) |
| `admin-frontend/sapot-admin/` | Next.js App Router (`app/`) |
| `GSM-module/GSM-fastapi/` | `main.py`, via `run-api.sh` |
| `captive-portal/` | served by MikroTik router, no app server |
| `tileserver/` | `deploy-tiling-server(-detached).sh` |

## Pull Request Checklist

- [ ] Tests updated/added for the affected project (`pytest` for `server/`; `pnpm test`/`pnpm testAll` for `mobile-app/`; note `admin-frontend/` has no test framework — don't fabricate one silently)
- [ ] Lint passes for the affected project (`pnpm run lint` in `admin-frontend/`, `pnpm lint` in `mobile-app/`)
- [ ] Type checking passes where applicable (`pnpm typecheck` in `mobile-app/`; TypeScript build in `admin-frontend/`)
- [ ] `docs/` updated if the change affects architecture, API surface, database schema, or a documented feature — check `docs/README.md` for the right subdoc; OpenAPI/DB docs may need regeneration (`scripts/generate_openapi_docs.py`, `scripts/generate_db_docs.py`) if `server/app/**` changed (CI checks this)
- [ ] No new cross-project relative imports or shared-code shortcuts introduced — project boundaries (`server/`, `mobile-app/`, `admin-frontend/`, `GSM-module/`) respected
- [ ] No unnecessary dependencies added to the wrong project's `package.json`/`requirements.txt` — verify the dependency belongs to the project being changed
- [ ] Branch name and commit messages follow `CONTRIBUTING.md` conventions; no direct commits to `main`
- [ ] Version files (`server/app/version.py`, `mobile-app/sapot-mobile-app/package.json`) only touched via the documented release process (`scripts/release.sh`), not by hand
