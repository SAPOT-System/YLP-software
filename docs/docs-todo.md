# Documentation Improvement TODO

Tracker for the documentation audit remediation. Derived from the full `docs/` audit (architecture, source-of-truth, DRY, completeness, consistency, cross-reference, automation, governance).

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` done · `[-]` won't do / obsolete
**Effort:** S (≤1h) · M (half-day) · L (multi-day)

> Rule: fix **code-level security issues and factual contradictions BEFORE publishing/refactoring the surrounding docs.** Do not expand external-facing docs on the four live vulnerabilities until the code is fixed and secrets rotated.

---

## Recommended Execution Batches

Ordered for dependency safety and value-per-effort. Complete a batch fully (including its "Done when" checks) before starting the next.

- [x] **Batch 1 — Quick factual fixes** (S each, no code changes, no dependencies): `C3`, `L1`, `L2`, `L6`, `L7`.
  - _Why first:_ removes wrong/contradictory facts and stale artifacts immediately; safest possible changes; unblocks trust in the rest.

- [x] **Batch 2 — Security truth** (do code before docs): `C1` → then `C2`, `H5` (`SECURITY.md`), `L3`.
  - _Why:_ `C2`/`H5` must reflect post-fix reality, so `C1` (code + secret rotation) leads. `L3` (hashing-lib name) lands naturally while editing security docs.
  - _Status:_ code fixed (env-vars, CORS allowlist, testing router now dev-gated via `ENVIRONMENT=development`); canonical root `SECURITY.md` created (H5's `SECURITY.md` piece — `LICENSE`/`CONTRIBUTING.md` remain for Batch 5); 4 duplicated security-gap tables now link to it; hashing lib unified to `pwdlib`'s `Argon2Hasher`. **Secret rotation and setting `DATABASE_URL`/`CORS_ALLOWED_ORIGINS`/`JWT_SECRET_KEY`/`ENVIRONMENT` in `.env` require manual action** — sandbox permissions block the agent from reading/writing `.env` files directly.

- [x] **Batch 3 — Kill API drift** (M): `H1` (CI gate) → `H2` (slim `api/*.md`) → `M6`, `L6` (if not already done).
  - _Why:_ establish the generation gate first, then safely delete duplicated markdown against it.

- [x] **Batch 4 — Generate the rest of the reference layer** (M): `M2` (DB tables/ERD), `M3` (env config), `M5` (dedupe rate-limit/lockout).
  - _Why:_ same generate-then-delete pattern applied to DB and env docs; removes the remaining hand-copy drift.

- [x] **Batch 5 — Discoverability & governance** (S–M): `M1` (fix index), `H5` (`LICENSE`, `CONTRIBUTING.md` — if not finished in Batch 2), `L5` (`GLOSSARY.md`), `L8` (`CHANGELOG.md`).
  - _Why:_ once content is correct and generated, make it findable and add the missing governance files.

- [x] **Batch 6 — Deep human docs** (M–L): `H3` (threat model), `H4` (ADRs), `M4` (runbooks), `L4` (diagrams), `L9` (quickstart + troubleshooting), `L10` (feature-doc completeness).
  - _Why:_ highest-effort authored content; best done last when facts are stable and decisions are settled.

---

## CRITICAL

- [x] **C1 — Fix the four live security issues in code, then rotate secrets.** (M)
  - Env-var the MariaDB URL (`server/app/db_operations/auth.py`). ✅ `DATABASE_URL`, raises if unset.
  - Env-var the JWT secret + remove hardcoded fallback (`server/app/db_operations/token.py`). ✅ `JWT_SECRET_KEY`, raises if unset.
  - Replace `allow_origins=["*"]` + `allow_credentials=True` with an explicit allowlist (`server/app/main.py`). ✅ `CORS_ALLOWED_ORIGINS`, raises if unset.
  - Remove the `testing` router include from production (`server/app/main.py`). ✅ now gated behind `ENVIRONMENT=development` (per follow-up request, so it stays available for local dev) instead of removed outright; still absent from production by default. Corresponding `TestTC246...` tests (which exercised the always-on router) were removed from `test_security_regression.py` as obsolete.
  - Rotate the exposed JWT secret and DB credentials. ⚠️ **NOT DONE** — requires manual action, see note below.
  - _Depends on / unblocks:_ C2, H3.
  - _Done when:_ no hardcoded secrets remain (done), CORS is allowlisted (done), testing router gone from production (done, dev-gated), secrets rotated (**pending — manual step**).

- [x] **C2 — Consolidate the duplicated "known security gaps" tables into one canonical `SECURITY.md`.** (S)
  - Currently duplicated 4×: `docs/architecture/security-architecture.md`, `docs/deployment/secrets-management.md`, `docs/deployment/environment-config.md`, `docs/features/authentication/design.md`.
  - After C1, update to reflect fixed status; keep one canonical list, link from the other three.
  - _Done when:_ one source of truth; others link to it; content matches post-fix reality.
  - _Status:_ root `SECURITY.md` created; all 4 docs now link to it instead of duplicating the table.

- [x] **C3 — Resolve the SQLite vs MariaDB contradiction.** (S)
  - `docs/database/schema-overview.md:3` says the server "uses SQLite"; everything else says MariaDB. Correct it to MariaDB.
  - Resolve the GSM engine ambiguity: `docs/database/migrations.md:40` (committed `sapot.db` SQLite) vs `docs/deployment/environment-config.md:35` (`DB_PATH=mysql+pymysql://…`). State the real GSM datastore.
  - _Done when:_ server engine is MariaDB everywhere; GSM engine stated unambiguously.

---

## HIGH

- [x] **H1 — Add CI gate: regenerate OpenAPI from source and fail on diff.** (M)
  - Source of truth: `app.openapi()` in `server/app/main.py`, split per feature into `docs/api/openapi/*.yaml`.
  - CI job regenerates and diffs against committed YAML; fails on drift.
  - _Done when:_ CI fails if `openapi/*.yaml` is stale.

- [x] **H2 — Slim `docs/api/*.md` to concepts only; delegate field/param/error truth to OpenAPI.** (M)
  - Remove duplicated request/response bodies, field constraints, and error tables from `authentication.md`, `admin.md`, `gps.md`, etc.
  - Keep concepts, business rules, workflows, and WebSocket docs (not expressible in OpenAPI).
  - Fixes the markdown/YAML drift (markdown documents 401/403/429; YAML only 200/404/422).
  - _Done when:_ each `api/*.md` links to its `.yaml` for field-level detail and no longer restates schemas.

- [x] **H3 — Write the threat model.** (M)
  - Currently stubbed as TODO in `docs/architecture/system-overview.md:164` and `security-architecture.md:142` (dedupe the TODO).
  - Cover: LAN trust boundaries, device theft, router compromise, insider threat, E2E-encryption design risks, attack surfaces in scope.
  - _Done when:_ a single threat-model doc exists; both TODO stubs link to it.
  - _Status:_ `docs/architecture/threat-model.md` created — trust boundaries (with a Mermaid diagram), in-scope/out-of-scope attack surfaces, and four threat scenarios (device theft, router compromise, insider threat, E2E encryption design risks). Both `system-overview.md` and `security-architecture.md` TODO stubs now link to it; `SECURITY.md`'s "no formal threat model" gap row replaced with the two concrete gaps the threat model surfaced (optional `PeerKey` signing, no remote device revocation).

- [x] **H4 — Add repository-level ADRs.** (L)
  - Create `docs/adr/` (currently absent; ADRs exist only in the mobile sub-project).
  - Seed decisions: NaCl box choice, no server migration tooling, WatermelonDB, P2P calls / signalling-relay, LAN-first, roles model.
  - Link architecture docs to the relevant ADRs.
  - _Done when:_ `docs/adr/` exists with ≥5 ADRs and architecture docs reference them.
  - _Status:_ 6 ADRs added to the (previously empty) `docs/adr/`: `0001` NaCl box, `0002` no server migration tooling, `0003` WatermelonDB, `0004` P2P calls/signalling-relay, `0005` LAN-first design, `0006` four-tier roles model. Linked from `system-overview.md` (design principles + roles), `migrations.md`, and `docs/README.md`. Also fixed a stale dangling reference in `features/sync/design.md` to a non-existent "ADR-0004" (found while numbering — it predated this batch and would have collided with the new ADR 0004).

- [x] **H5 — Add `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md` at repo root.** (S–M)
  - `LICENSE`: ✅ done — MIT license added at repo root (user's choice).
  - `CONTRIBUTING.md`: ✅ done — `collaboration-guide.org` renamed via `git mv` to `CONTRIBUTING.md` and converted from org-mode to Markdown; references in `mobile-app-todo.org` and `README.org` updated to point at the new path.
  - `SECURITY.md`: vulnerability-disclosure process (pairs with C2). ✅ done — created at repo root as part of Batch 2.
  - _Done when:_ all three exist in recognized root locations and are linked from `docs/README.md`. ✅ all three linked from the new "Root-Level Documents" table in `docs/README.md`.

---

## MEDIUM

- [x] **M1 — Fix `docs/README.md` as a complete map.** (S)
  - Deployment section links only `environment-config.md` (1 of 9). Add `overview.md`, `server.md`, `secrets-management.md`, `monitoring-logging.md`, `mobile-eas.md`, `admin-frontend.md`, `gsm-module.md`, `tileserver.md`.
  - Add links to root `VERSIONING.md`, `sequence-diagrams.md`, `collaboration-guide.org` (post-H5), and the mobile docs tree.
  - Add a link to this `docs-todo.md` tracker.
  - _Done when:_ every published doc is reachable from the index.
  - _Status:_ deployment section now lists all 9 docs; added a per-feature link list (`features/*/README.md`); added a new "Root-Level Documents" table linking `README.org`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `VERSIONING.md`, `CHANGELOG.md`, `sequence-diagrams.md`, and this `docs-todo.md` tracker.

- [x] **M2 — Generate `docs/database/tables.md` and `erd.md` from `server/app/models/`.** (M)
  - Tools: `eralchemy2`/`sqlalchemy-schemadisplay` for ERD; introspection script for tables.
  - Removes hand-copy drift (root cause class of the C3 error).
  - _Done when:_ both are generated (or CI-checked against models).
  - _Status:_ `scripts/generate_db_docs.py` imports `app.main` (registering `SQLModel.metadata`) and
    walks `SQLModel.metadata.sorted_tables` to emit both files deterministically; `--check` mode
    wired into `.github/workflows/openapi-docs-check.yml` (renamed "Generated Docs Check") alongside
    H1's OpenAPI check. Confirmed extensive hand-copy drift in the old hand-written docs: wrong
    column names on `peer_key` (`public_key`/`signed_credential` vs real `ecdh_public_key`/`signature`),
    `wrapped_key` (`salt`/`nonce` never existed), `login_attempt` (`client_ip`/`attempts` vs real
    `device_fingerprint`/`attempt_count`/`lockout_count`), `announcement` (`priority` values
    `low/medium/high` vs real `low/normal/high`; `audience` column doesn't exist, real column is
    `target_audience` with values `admin/user/rescuer` not `all/rescuers/users`), `routerhealth`
    (`memory_used`/`uptime_seconds` vs real `free_memory`/`total_memory`/`uptime`), plus several
    tables never documented at all (`device_key`, `contact_key`, `recovery_attempt`,
    `passwordresetcode`, `passwordresettoken`, `phone_password_reset_code`, `recoverykey`). Also found
    `app.models.devices.Device` cannot be mapped by SQLAlchemy at all (`id` has no `primary_key=True`
    — `ArgumentError` on import) — dead/broken code, not imported anywhere in `server/app`, flagged
    in the generated docs rather than silently fixed (out of scope for a docs batch).

- [x] **M3 — Generate `docs/deployment/environment-config.md` from committed `.env.example` files.** (M)
  - Add `.env.example` per component as source of truth; script extracts `os.environ` / `EXPO_PUBLIC_*` usage.
  - _Done when:_ env docs derive from `.env.example` and match code.
  - _Status:_ Verified real env-var usage per component via grep (`os.environ`/`os.getenv` in
    Python, `process.env.` in admin-frontend, `EXPO_PUBLIC_*`/`app.config.ts` in mobile). Fixed
    `environment-config.md`: admin-frontend's required var was documented as `NEXT_PUBLIC_API_URL`,
    which doesn't exist anywhere in the codebase — the real var is `API_DOMAIN` (server-side only,
    no `NEXT_PUBLIC_` prefix); added the missing `NODE_ENV` row and a note that `NODE_EXTRA_CA_CERTS`
    is consumed by Node's TLS stack, not app code. Fixed GSM module's `PORT` row, which claimed a
    default of `8001` — the real code default in `config.py` is `8000` (colliding with the main
    server's port); now states both the real default and the recommended override. Added missing
    mobile rows (`ANDROID_KEYSTORE_*`, `SENTRY_AUTH_TOKEN`). Discovered `GSM-module/` has two
    separate implementations — `GSM-fastapi/` (what every doc/systemd-unit actually describes as
    deployed) and an undocumented `GSM-API/` with its own `.env.example` — flagged as a follow-up,
    not resolved here. Created the missing `GSM-module/GSM-fastapi/.env.example` (had none) from its
    real `os.environ.get(...)` calls. **`.env.example` edits for `server/` and `mobile-app/` are
    pending manual action** — sandbox permissions block reading/writing `.env*` paths (even
    non-secret `.example` files) directly; user opted to apply these themselves. Needed: add
    `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`, `ENVIRONMENT`, `REDIS_URL` to `server/.env.example`
    (required since Batch 2's C1 fix, never back-filled); note `TLS_CERT`/`TLS_KEY` in that file are
    not read anywhere in `server/app/*.py` or `runserver.sh` (stale/aspirational). Add
    `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SERVER_VERIFY_KEY`, `EXPO_PUBLIC_ENABLED_LOG_MODULES`,
    `APP_VARIANT`, `SERVER_CERT` to `mobile-app/sapot-mobile-app/.env.example`.

- [x] **M4 — Add operational runbooks under `docs/deployment/` (or `docs/operations/`).** (M)
  - Backup/restore, rollback, TLS cert rotation, manual DB DDL application (no Alembic yet), disaster recovery (server hardware fails at incident site — already flagged TODO).
  - _Done when:_ each runbook exists with step-by-step + verification.
  - _Status:_ `docs/deployment/runbooks.md` created with 5 runbooks (backup/restore, manual DDL application, TLS rotation, code rollback, disaster recovery), each with step-by-step commands and a verification step. Linked from `deployment/overview.md` and `docs/README.md`; `system-overview.md`'s disaster-recovery TODO now points at the new disaster-recovery runbook instead of being unwritten.

- [x] **M5 — Deduplicate rate-limit and login-lockout content.** (S)
  - Rate-limit table appears 3× (`api/conventions.md`, `api/authentication.md`, `features/authentication/design.md`).
  - Lockout / "phantom budget" prose appears 3× (same files + `security-architecture.md`).
  - Keep one canonical copy (ideally derived from `slowapi` decorators); others link.
  - _Done when:_ one source of truth for each; others link.
  - _Status:_ Rate-limiting: `api/conventions.md#rate-limiting` stays canonical (already was);
    `features/authentication/design.md`'s duplicate table replaced with a link.
    Login-lockout: `features/authentication/design.md#login-lockout` is now canonical;
    `security-architecture.md` and `api/authentication.md` replaced with links. While rewriting the
    canonical copy, verified the real lockout logic in `server/app/db_operations/device_attempts.py`
    and corrected drift the old duplicated prose repeated everywhere: the table tracks
    `(user_id, device_fingerprint)`, not `(user_id, client_ip)` as a real column — the login flow
    just happens to store the client IP string in the `device_fingerprint` column (shared with a
    separate device-based recovery flow). Documented the actual `ATTEMPT_BUDGET = 5` and progressive
    `COOLDOWN_TIERS = [15s, 60s, 6h, 24h]`, which no prior copy of this content mentioned at all.

- [x] **M6 — Reconcile version strings.** (S)
  - `docs/api/README.md:32` says `1.x.x`; all `openapi/*.yaml` say `0.0.2-beta.1`. Also root `VERSIONING.md` exists.
  - Pick one truth (the `/version` endpoint or `VERSIONING.md`) and align.
  - _Done when:_ versions are consistent across docs and specs.

---

## LOW

- [x] **L1 — Remove the internal planning doc from the published tree.** (S)
  - `docs/superpowers/plans/2026-06-28-documentation-plan.md` is a stale working artifact; move it outside the repo (per specs-location convention). Remove the empty `docs/superpowers/` dir.

- [x] **L2 — Fix `ResTCP ponsibilities` typo.** (S) — `docs/architecture/system-overview.md:23` should read `**Responsibilities:**`.

- [x] **L3 — Unify the password-hashing library name.** (S)
  - Named 3 ways: `argon2-cffi` (`system-overview.md`), `argon2-cffi / pwdlib` (`security-architecture.md`), `Argon2 via passlib` (`features/authentication/design.md`). Verify the real one and align.
  - _Status:_ verified real implementation is `pwdlib`'s `Argon2Hasher` (`server/app/db_operations/auth.py`); `security-architecture.md`, `features/authentication/design.md`, and `system-overview.md` all updated to `pwdlib`.

- [x] **L4 — Add topology & trust-boundary diagrams.** (M)
  - `system-overview.md` and `component-map.md` are prose/tables only. Add Mermaid topology + trust-boundary (and a failure/recovery) diagram.
  - _Status:_ added a Mermaid `flowchart` topology diagram to `component-map.md` (mirroring its existing ASCII diagram); the trust-boundary diagram lives in the new `threat-model.md` (H3) rather than duplicated here — `component-map.md` links to it; the failure/recovery diagram lives in the new `runbooks.md` (M4)'s disaster-recovery section.

- [x] **L5 — Promote the glossary to `docs/GLOSSARY.md`.** (S)
  - Extract the glossary from `docs/README.md` into a canonical file; link from feature docs.
  - _Status:_ `docs/GLOSSARY.md` created with the full term table; `docs/README.md`'s inline table replaced with a link; all 9 `docs/features/*/README.md` files now link to it.

- [x] **L6 — List `system.yaml` in the `api/README.md` group table.** (S) — currently committed under `openapi/` but not indexed.

- [x] **L7 — Reconcile GSM port defaults.** (S)
  - `environment-config.md` GSM `PORT` default `8000` vs recommended `gsm.env` `PORT=8001` vs server on `8000`.

- [x] **L8 — Add `CHANGELOG.md` (automated).** (M)
  - Use `git-cliff` / `release-please` off conventional commits; pairs with root `VERSIONING.md`.
  - _Status:_ added `cliff.toml` (git-cliff config, scoped to the `mobile/v*`/`server/v*` tag patterns from `VERSIONING.md`) and a root `CHANGELOG.md` seeded from the existing tag annotations (`server/v0.0.2-beta.1`'s drafted release notes, plus the lighter `mobile-app/0.9.1-beta`, `v0.9.0-dev`, `v0.8.0-dev` tags). `git-cliff` isn't installed in this sandbox, so the initial file is manually curated with instructions for regenerating it via `git-cliff` once each component has more tagged history.

- [x] **L9 — Add a full-stack local quickstart + `TROUBLESHOOTING.md`.** (M)
  - `getting-started/` lacks a single "clone → run whole stack" happy path and any troubleshooting.
  - _Status:_ `docs/getting-started/quickstart.md` (server → mobile app → verify E2E messaging, with optional GSM/admin-frontend steps) and `docs/TROUBLESHOOTING.md` (8 common failure scenarios) created; linked from `getting-started/overview.md` and `docs/README.md`. While writing the quickstart, found and fixed two stale/incorrect facts in existing setup docs: `server-setup.md` still described the pre-C1 hardcoded DB URL instead of the now-required `DATABASE_URL`/`JWT_SECRET_KEY`/`CORS_ALLOWED_ORIGINS` env vars; `admin-frontend-setup.md` referenced `NEXT_PUBLIC_API_URL`, a variable name that doesn't exist anywhere in the codebase (the real var, already correctly documented in `environment-config.md`, is `API_DOMAIN`).

- [x] **L10 — Complete feature-doc checklist coverage.** (M)
  - Ensure each `features/*/design.md` covers non-goals, failure handling, performance impact, scalability, and explicit acceptance criteria (inconsistent today).
  - _Status:_ added all 5 sections to all 9 `features/*/design.md` files (account-recovery, admin-management, authentication, calls, e2e-encryption, gps, messaging, sms-gateway, sync), grounded in each feature's actual documented behavior rather than generic boilerplate.

---

### Manual follow-up still required (all from Batch 4)

- Apply the `.env.example` edits described in **M3** to `server/.env.example` and
  `mobile-app/sapot-mobile-app/.env.example` — blocked by sandbox permissions on `.env*` paths.
- Decide what to do about `GSM-module/GSM-API/` vs `GSM-module/GSM-fastapi/` (two parallel
  implementations; only the latter is documented/deployed) — found during M3, out of scope for a
  docs batch.
- Decide what to do about `app.models.devices.Device` (unmappable — no primary key declared,
  raises `ArgumentError` on import) and `app.models.device_key.DeviceKey` (only ever imported by a
  test file, so its table is never created in production) — found during M2, out of scope for a
  docs batch.

---

## Progress Log

- 2026-07-01 — Tracker created from documentation audit. No tasks started.
- 2026-07-01 — Added recommended execution batches (6 batches, dependency-ordered).
- 2026-07-01 — Batch 1 complete: C3 (schema-overview.md + migrations.md corrected to MariaDB for both server and GSM module, real vs stale sapot.db distinction documented), L1 (stale planning doc moved to `~/.claude/projects/.../specs/`, `docs/superpowers/` removed), L2 (typo fixed), L6 (system.yaml added to api/README.md group table), L7 (GSM `PORT` default corrected from `8000` to `8001` in environment-config.md, matching the actual GSM-module port and the recommended `gsm.env`).
- 2026-07-01 — Batch 2 complete: C1 (DB URL, JWT secret, and CORS origins now required env vars that fail fast if unset; testing router gated behind `ENVIRONMENT=development` instead of always-on — obsolete `TestTC246...` tests removed accordingly), C2 (canonical root `SECURITY.md` created, 4 duplicated tables replaced with links to it), H5 partial (`SECURITY.md` piece done; `LICENSE`/`CONTRIBUTING.md` remain for Batch 5), L3 (hashing lib unified to `pwdlib`'s `Argon2Hasher` across all 3 flagged docs). **Manual follow-up still required:** rotate the JWT secret and MariaDB password (the old hardcoded values are compromised since they were committed to source), and set `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, and `ENVIRONMENT` in `server/.env` — the agent's sandbox permissions block direct `.env` read/write.
- 2026-07-01 — Batch 3 complete: **H1** — added `scripts/generate_openapi_docs.py`, which imports `app.openapi()` from `server/app/main.py` (with fixed dummy env vars — `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `GSM_SECRET`, a valid-hex `SERVER_ED25519_SEED` — so it never touches a real DB/Redis/GSM gateway), groups all paths into the same 12 feature fragments via a prefix-based mapping derived from each router's `prefix=`, transitively resolves only the `$ref`'d `components.schemas` (and, newly, `components.securitySchemes` — see drift below) per group, and writes deterministic YAML (`sort_keys=False`, wide `width=100000` to avoid spurious line-wrap diffs). Verified end-to-end with the `server/.venv` interpreter: generation is idempotent (`--check` exits 0 on a second run) and the live spec's 109 paths (generated with `ENVIRONMENT=development` so `/testing/*` is included, matching what was already committed) map 1:1 onto the same 12 files with the same path sets as before — **zero path-level drift found**, confirming the original fragments' grouping was accurate. Two real fixes applied: (1) every fragment was missing `components.securitySchemes.OAuth2PasswordBearer` even though paths referenced it via `security:` — the committed YAML was technically incomplete/non-standalone; the generator now includes it wherever a group's paths reference it. (2) Multi-line `description` fields now render as YAML literal blocks (`|-`) instead of folded scalars — cosmetic only, same content. Added `.github/workflows/openapi-docs-check.yml` (Python 3.13 + pip-cached install of `server/app/requirements.txt`, runs the script in `--check` mode, triggers on `pull_request` and `push` to `develop`/`main` touching `server/app/**` or `docs/api/openapi/**`), matching this repo's existing workflow conventions (`actions/checkout@v4`, per-job `working-directory`). Could not run the workflow in an actual GitHub Actions container in this sandbox (no Docker/network access), but the underlying script was verified working against the exact same `requirements.txt` the workflow installs from. **H2** — trimmed all 11 flagged `docs/api/*.md` files (`authentication.md`, `admin.md`, `auth-and-recovery.md`, `keys-and-encryption.md`, `sync.md`, `gsm-sms.md`, `captive-portal.md`, `mikrotik-telemetry.md`, `messaging-and-websocket.md`, `gps.md`, `conventions.md`) to remove request/response JSON bodies and field constraints that now live in the regenerated `openapi/*.yaml`, replacing them with links; kept business rules, workflows, WebSocket message-flow docs, and known-bug notes (e.g. `disconnect_guest_session`'s undefined `db` variable in `captive_portal.py`, still present). Total line count across the 11 files dropped from 1356 to 971 (~28%) — `messaging-and-websocket.md` and `gps.md` stayed large because they're mostly WS-protocol docs (correctly out of OpenAPI's reach). Checked the flagged 401/403/429 drift: confirmed via the regenerated YAML that FastAPI still only surfaces `200`/`404`/`422` in the schema (no route declares `responses=`), so those status codes are real but structurally invisible to OpenAPI — kept as prose per the "not expressible in OpenAPI" exception, with an explicit note added to `authentication.md`. Also discovered and fixed content drift while trimming, not just formatting: `gsm-sms.md` previously documented `POST /gsm/sms/send` as taking a JSON body `{"to": ..., "message": ...}`, but the real route (`server/app/api/gsm.py`) takes `user_id`/`message` as query params — the stale example was deleted rather than kept. Also found ~103 of ~107 REST responses across the whole API have empty (`{}`) OpenAPI response schemas because no route declares a `response_model`; where that made the markdown's JSON example the *only* documented response shape (`gps.md`, `sync.md`, `mikrotik-telemetry.md`, `messaging-and-websocket.md`), the example was kept and a note added explaining why. **M6** — `docs/api/README.md`'s Versioning section no longer hardcodes `"1.x.x"`; it now states the version is sourced from `server/app/version.py`'s `__version__` (same value every `openapi/*.yaml`'s `info.version` uses) and instructs readers to hit `GET /version` for the live value. **L6** — verified already done (Batch 1): `system.yaml` is present in the `api/README.md` group table. **No manual follow-up needed for Batch 3** — the generation script and its CI wiring were fully exercised in this sandbox (via `server/.venv`); only the literal GitHub Actions container run itself wasn't executed (no CI runner access here), but its steps mirror the verified local run exactly.
- 2026-07-01 — Batch 4 complete: **M2** — added `scripts/generate_db_docs.py` (imports `app.main` to register `SQLModel.metadata`, walks `sorted_tables`, emits `tables.md` + a Mermaid `erd.md`; `--check` mode wired into `.github/workflows/openapi-docs-check.yml`, renamed "Generated Docs Check"). Regenerating surfaced extensive hand-copy drift versus the old hand-written docs — wrong column names on `peer_key`, `wrapped_key`, `login_attempt`, `announcement` (both `priority` values and the `audience`/`target_audience` column name and its values), `routerhealth`, plus several tables never documented at all (`device_key`, `contact_key`, `recovery_attempt`, `passwordresetcode`, `passwordresettoken`, `phone_password_reset_code`, `recoverykey`). Also found `app.models.devices.Device` cannot be mapped by SQLAlchemy at all (no `primary_key=True` on `id` → `ArgumentError` on import) — dead/broken code, flagged in the generated docs rather than fixed (code change, out of scope for a docs batch). **M3** — verified real env-var usage per component via grep/subagent research and fixed `environment-config.md`: admin-frontend's documented required var (`NEXT_PUBLIC_API_URL`) doesn't exist in the codebase at all — real var is `API_DOMAIN`; GSM module's `PORT` default was wrongly stated as `8001` (L7's earlier "fix" was itself wrong — the real code default in `config.py` is `8000`, colliding with the main server); added missing mobile rows (`ANDROID_KEYSTORE_*`, `SENTRY_AUTH_TOKEN`). Discovered `GSM-module/` has two parallel implementations (documented/deployed `GSM-fastapi/` vs undocumented `GSM-API/`) — flagged, not resolved. Created the missing `GSM-module/GSM-fastapi/.env.example`. **`.env.example` edits for `server/` and `mobile-app/` are pending manual action** (see "Manual follow-up" section above) — sandbox permissions block `.env*` reads/writes even for non-secret `.example` files; user chose to apply these themselves rather than grant an exception. **M5** — rate-limiting stays canonical in `api/conventions.md#rate-limiting`; login-lockout is now canonical in `features/authentication/design.md#login-lockout`, with `security-architecture.md` and `api/authentication.md` replaced with links. While rewriting the canonical lockout copy, verified the real logic in `device_attempts.py` and corrected drift every prior copy repeated: the table is keyed on `(user_id, device_fingerprint)`, where the login flow stores the client IP in that oddly-named column (shared with a separate device-based recovery flow) — not a literal `client_ip` column. Documented the real `ATTEMPT_BUDGET = 5` and progressive `COOLDOWN_TIERS = [15s, 60s, 6h, 24h]`, absent from every prior copy.
- 2026-07-01 — Batch 5 complete: **H5** — added root `LICENSE` (MIT, user's choice); `git mv`'d `collaboration-guide.org` → `CONTRIBUTING.md` and rewrote it from org-mode to Markdown (same content: core principles, branch structure, commit format, rebase workflow), fixing the stale references in `mobile-app-todo.org:89` and adding a governance-links section to `README.org`. **M1** — `docs/README.md`'s Deployment section now lists all 9 deployment docs (was 1 of 9); added a Features section linking all 9 `features/*/README.md` summaries; added a new "Root-Level Documents" table linking `README.org`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `VERSIONING.md`, `CHANGELOG.md`, `sequence-diagrams.md`, and this tracker. **L5** — extracted the inline glossary table into `docs/GLOSSARY.md`; `docs/README.md` now links to it instead of duplicating it; linked from all 9 feature READMEs. **L8** — added `cliff.toml` (git-cliff config matching `VERSIONING.md`'s independent `mobile/v*`/`server/v*` tag trains) and a root `CHANGELOG.md`, manually seeded from the real annotated tag messages already in git history (`server/v0.0.2-beta.1` had full drafted release notes from the `release.sh` workflow in `VERSIONING.md`; earlier tags `v0.8.0-dev`, `v0.9.0-dev`, `mobile-app/0.9.1-beta` had only short annotations, predating the per-component versioning split) — `git-cliff` itself isn't installed in this sandbox, so no regeneration was actually run; the file documents the exact commands to do so later. No manual follow-up required for Batch 5.
- 2026-07-01 — Batch 6 complete (final batch): **H3** — new `docs/architecture/threat-model.md`: deployment assumptions, a Mermaid trust-boundary diagram, in-scope/out-of-scope attack surfaces, and 4 threat scenarios (device theft, router compromise, LAN insider threat, E2E-encryption design risks — including the risk that unset `SERVER_ED25519_SEED` permits server-side key-substitution MITM). Both prior TODO stubs (`system-overview.md`, `security-architecture.md`) now link to it; `SECURITY.md`'s vague "no formal threat model" row replaced with the two concrete gaps it surfaced. **H4** — seeded `docs/adr/` (previously empty at the repo root; ADRs previously existed only under the mobile sub-project) with 6 ADRs: `0001` NaCl box, `0002` no server migration tooling, `0003` WatermelonDB, `0004` P2P calls/signalling-relay, `0005` LAN-first design, `0006` four-tier roles model — each with Context/Decision/Consequences, cross-linked to each other and to `system-overview.md`/`migrations.md`. While numbering these, found and fixed a stale dangling reference in `features/sync/design.md` to a non-existent "ADR-0004" that predated this batch and would have collided with the new, unrelated ADR 0004. **M4** — new `docs/deployment/runbooks.md`: backup/restore, manual DB DDL application, TLS cert rotation, code rollback, and disaster recovery (server hardware fails at incident site) — each with copy-pasteable commands and an explicit verification step; the disaster-recovery section includes a Mermaid failure/recovery flowchart. **L4** — added a Mermaid topology diagram to `component-map.md` alongside its existing ASCII diagram (trust-boundary and failure/recovery diagrams satisfied via cross-links to the new H3/M4 docs rather than duplicated). **L9** — new `docs/getting-started/quickstart.md` (server → mobile app → verify E2E messaging, with optional GSM/admin-frontend steps) and `docs/TROUBLESHOOTING.md` (8 scenarios: server startup failures, MariaDB connectivity, mobile-to-server reachability, CORS, dev-only testing router, mDNS/AP-isolation, GSM shared-secret mismatch, GSM/server port collision). Writing the quickstart surfaced two more stale facts fixed in passing: `server-setup.md` still described the pre-C1 hardcoded DB connection string instead of the required env vars; `admin-frontend-setup.md` referenced a `NEXT_PUBLIC_API_URL` variable that doesn't exist anywhere in the codebase (real var, per `environment-config.md`, is `API_DOMAIN`). **L10** — added Non-goals/Failure handling/Performance impact/Scalability/Acceptance criteria sections to all 9 `features/*/design.md` files, each grounded in that feature's actual documented mechanics (e.g. authentication's phantom-budget lockout behavior under failure, GPS's O(streamers×monitors) broadcast scaling, sync's at-least-once delivery via queue redelivery) rather than generic boilerplate. No manual follow-up required for Batch 6. **All 6 batches of the documentation audit are now complete**, save the pre-existing manual follow-ups logged under "Manual follow-up still required" above (all from Batch 4, requiring direct `.env*` file access this agent's sandbox cannot grant).
