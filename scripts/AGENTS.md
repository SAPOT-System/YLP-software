# AGENTS.md — scripts

Root-level release orchestration and documentation-generation tooling — spans `mobile-app/`'s and `server/`'s version files, and generates `docs/api/openapi/**` / `docs/database/*.md` from `server/`. See the root `AGENTS.md` for repo-wide conventions.

## Development Workflow

- Python scripts (`generate_openapi_docs.py`, `generate_db_docs.py`) run against `server/`'s dependencies — install `server/app/requirements.txt` first, or run from an environment that already has the server's stack.
- `release.sh` is the entry point end users/agents invoke directly: `./scripts/release.sh <mobile|server> <X.Y.Z[-suffix]>` — see root `VERSIONING.md` for the full flow.

## Build

None — these are standalone scripts, not a packaged/compiled project.

## Test

- No tests exist for `generate_openapi_docs.py` / `generate_db_docs.py` or `release.sh` — verify these manually (e.g. `--check` mode, per CI) rather than assuming coverage.

## Lint / Format

None configured for this directory specifically (no ESLint/Prettier/ruff config scoped here).

## Framework Expectations

- `generate_openapi_docs.py` and `generate_db_docs.py` support a `--check` flag (used by `.github/workflows/openapi-docs-check.yml` to fail on drift) — if you change either script's output format, run it with `--check` against current `docs/` output to confirm CI won't break, and regenerate `docs/api/openapi/**`/`docs/database/*.md` if the change is intentional.
- `release.sh` never pushes automatically (prints the push command for the user to run). Don't add auto-push without flagging it as a deliberate policy change.
- `release.sh` tags with a plain `<component> <version>` annotated message — it no longer drafts or opens release notes; CI publishes that message verbatim as the GitHub Release body.

## Do Not Edit Manually

- Nothing generated lives in this directory itself, but this directory *generates* files elsewhere that should not be hand-edited: `docs/api/openapi/*`, `docs/database/{tables,erd}.md` (see `server/AGENTS.md`).

## Common Pitfalls

- Editing `generate_openapi_docs.py`/`generate_db_docs.py` output format without regenerating the actual `docs/` files — CI will flag the drift on the next PR that touches `server/app/**`.
- Assuming `release.sh` pushes or opens a PR — it deliberately stops short of that; don't add auto-push behavior without being asked.

## Validation Checklist

- [ ] `python3 scripts/generate_openapi_docs.py --check` / `generate_db_docs.py --check` pass if either generator or `server/app/**` changed
- [ ] `release.sh` still prints (not runs) the final push command
