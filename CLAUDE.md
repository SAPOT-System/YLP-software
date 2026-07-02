# CLAUDE.md

Instructions for Claude Code working in this repository. This file governs *how* to work here, not *what* the code does — for that, see `docs/README.md` (full documentation index) and `CONTRIBUTING.md` (git workflow).

## Repository Shape (fact)

Not a package-graph monorepo — no root `package.json`, no Nx/Turborepo/pnpm-workspace, no shared internal packages. Six independently-built components, each with its own package manager and often its own `flake.nix`/`.envrc` (Nix, pinned toolchain — treat as required, not optional, per root `README.org`):

| Component | Stack |
|---|---|
| `mobile-app/sapot-mobile-app/` | Expo/React Native/TS |
| `admin-frontend/sapot-admin/` | Next.js 16/React 19/TS |
| `server/` | FastAPI/SQLModel/Python |
| `GSM-module/` | `GSM-fastapi/` (live FastAPI service) + `GSM-API/` (parallel WIP, not deployed) + Arduino `.ino` firmware |
| `captive-portal/` | Static HTML/CSS/JS |
| `tileserver/` | Deploy scripts only, no source |

Every component above has its own `CLAUDE.md` with project-specific architecture and conventions — **always read the target component's `CLAUDE.md` before editing there; it overrides this file for that subtree.** Full purpose/entry-point/dependency detail for each component: `docs/README.md`. Do not duplicate that table here — it will drift.

`GSM-module/GSM-fastapi/` is the live SMS-gateway service; `GSM-module/GSM-API/` is a parallel, incomplete rewrite not referenced by any deployment doc or by `server/` — see `GSM-module/CLAUDE.md` for the evidence and don't assume `GSM-API/` is dead code without reading it.

## Working Principles

- Identify the owning component before editing (see table above / `docs/README.md`). A single bug report can plausibly belong to any of three components — confirm which layer before touching files.
- Match the existing pattern in the target component (check `docs/architecture/`, `docs/adr/` for prior decisions — e.g. don't hand-roll encryption logic, see ADR 0001) rather than introducing a new one.
- Keep changes scoped to the component(s) the task requires; smallest diff that satisfies the request.
- Establish a passing baseline (run that component's test command) before changing code you didn't just write, so failures can be attributed correctly.

## Monorepo Workflow

- No shared library exists between mobile/server/admin — each owns its own API client. A server endpoint shape change does not propagate automatically; check `docs/api/openapi/` and update the mobile/admin caller in the same change.
- Cross-cutting changes (new sync field, new DB column, new message type) typically touch **server model + mobile WatermelonDB schema + `docs/database/tables.md` together** — treat these as one unit of work, not three separate tasks.
- Never create a build/import dependency between components (mobile importing server Python, etc.) — they only communicate over HTTP/WebSocket/TCP/WebRTC (`docs/architecture/component-map.md`).
- Don't touch sibling components' files for a single-component task.

## Before Writing Code

- Read `docs/architecture/*.md` and `docs/adr/*.md` relevant to the feature area — architecture decisions here are deliberate (e.g. no server migration tooling: ADR 0002; LAN-first design: ADR 0005) and easy to accidentally contradict.
- Find and mirror a comparable existing implementation in the same component (similar endpoint, similar screen/service) before writing new code from scratch.
- Mobile: read `mobile-app/sapot-mobile-app/CLAUDE.md` in full — DI container construction order is load-bearing and not obvious from the code alone.
- Server/DB: schema changes have **no migration tooling** (ADR 0002) — check `docs/database/migrations.md` for the manual process before altering `server/app/models/`.

## While Writing Code

- No repo-wide formatter is configured (ESLint only, per component) — don't introduce one or reformat files outside your diff.
- Check `requirements.txt` / `package.json` for an existing dependency that already does the job before adding one.
- Keep API responses consistent with `docs/api/conventions.md` (error envelope, pagination shape, epoch-ms sync timestamps vs. ISO-8601 elsewhere).
- Touching `server/app/**`: `docs/api/openapi/**` and `docs/database/{tables,erd}.md` are drift-checked in CI — regenerate via the commands in Verification below rather than hand-editing.
- Touching auth, secrets, env-var handling, or `server/app/db_operations/`: read `SECURITY.md` first. This repo has a documented history of committed credentials that had to be rotated; the current pattern is fail-fast at import time if a required secret env var is unset — preserve that pattern, don't add defaults/fallbacks for secrets.

## Verification

Run for each component actually touched — don't assume one component's green build covers another:

| Component | Command |
|---|---|
| `server/app/` | `pytest` (from `server/app/`) |
| `server/app/` API/DB surface changed | `python3 scripts/generate_openapi_docs.py --check` and `python3 scripts/generate_db_docs.py --check` — **run from repo root**, not `server/app/` |
| `mobile-app/sapot-mobile-app/` | `npm run testAll` (= test + typecheck + lint + expo-doctor), or the individual `npm test` / `npm run typecheck` / `npm run lint` |
| `admin-frontend/sapot-admin/` | `npm run lint && npm run build` — **no test script exists in this component**; don't claim test coverage that isn't there |
| `GSM-module/` | No automated tests exist — verify manually per `docs/getting-started/gsm-module-setup.md` |

If the change is release-relevant (server), `server/app/version.py` must match the git tag per `VERSIONING.md` before tagging — not typically a per-commit concern, but relevant if asked to prepare a release.

## Safety Rules

- Never edit generated/build output (`__pycache__/`, `.next/`, `node_modules/`, `.direnv/`) or hand-edit `docs/api/openapi/*.yaml`, `docs/database/tables.md`, `docs/database/erd.md` — these are generated; edit the source and regenerate.
- Never hand-edit lockfiles (`package-lock.json`, `flake.lock`) — only let the package manager update them.
- Never edit `.github/workflows/*.yml` or other CI/infra config unless the task explicitly asks for a CI change.
- Never bypass a failing test (skip, comment out, weaken an assertion) to make a change look done — fix the cause or report the failure.
- Never remove a test without stating why in the commit.
- No repo-wide reformatting or unrelated-file changes bundled into a task's diff.
- `.env` files are per-component and gitignored — never commit real secrets; use the sibling `.env.example` as the template.
- Commits never go directly to `main`; all work happens on `feature/`, `bugfix/`, or `chore/` branches (`CONTRIBUTING.md`). This repo's commit format includes a scope — `type(scope): summary` — not generic conventional commits; see `CONTRIBUTING.md` for the full convention rather than restating it here.

## Preferred Process

1. Identify the owning component(s).
2. Read that component's own `CLAUDE.md` if present, plus relevant `docs/architecture/` / `docs/adr/` entries.
3. Find a comparable existing implementation to mirror.
4. Make the smallest change that satisfies the request.
5. Update tests and any `docs/` page the change makes stale.
6. Run that component's verification commands (table above).
7. Report what changed, which component(s), and what was run to verify.
