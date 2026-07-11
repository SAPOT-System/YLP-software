# AGENTS.md — GSM-module

SMS gateway for SAPOT: phone → GSM modem → Arduino serial bridge → FastAPI service → `server/`. Two parallel Python services exist here (see below) plus Arduino firmware. See the root `AGENTS.md` for repo-wide conventions.

## Which service is which

- **`GSM-fastapi/`** — the **currently deployed** service (confirmed by `deployment-scripts/server-GSM-api.service`, which runs `GSM-fastapi/run-api.sh`). Flat script layout (`main.py`, `api.py`, `serial_worker.py`, `sms_handler.py`, `protocol.py`, `database.py`, `config.py`).
- **`GSM-API/`** — a newer, in-progress restructure with a proper `app/` package (`app/gsm/*`, `app/routes/sms.py`). Not wired into `deployment-scripts/` — treat as WIP, not production, unless told otherwise.
- **`GSM-arduino-actual-code/`, `GSM-trial-code/`** — Arduino `.ino` firmware for the serial bridge; C/C++, not Python.

Match the layout and conventions of whichever of `GSM-fastapi/`/`GSM-API/` you're actually editing — don't import patterns from one into the other.

## Development Workflow

- Both `GSM-fastapi/` and `GSM-API/` are Nix-flake managed (`flake.nix`/`flake.lock` in each).
- `GSM-fastapi/`: `pip install -r requirements.txt`, run via `run-api.sh` (activates `venv/`, runs `python3 main.py`).
- `GSM-API/`: no `requirements.txt` found — dependencies are presumably installed manually into a venv per `flake.nix`'s `shellHook` (`source ./venv/bin/activate`). TODO: confirm the actual install command with a maintainer.

## Build

No build step for either service — interpreted Python. Arduino sketches (`.ino`) are compiled/flashed via the Arduino IDE or `arduino-cli`; no CI or repo-level build command was found for the firmware.

## Test

No test tooling (pytest or otherwise) was found in either `GSM-fastapi/` or `GSM-API/`. Don't assume test coverage exists here.

## Lint / Format

- `GSM-API/` has `pyrightconfig.json` — Pyright is the type checker for that service; run `pyright` from `GSM-API/` when editing it.
- `GSM-fastapi/` has no linter/type-checker config.
- Neither service has a formatter configured.

## Framework Expectations

- `GSM-fastapi/config.py` has a known hardcoded default DB path (open gap, see root `SECURITY.md`) — don't copy this pattern into `GSM-API/` or elsewhere; new code should read config from environment variables.
- `GSM-API/app/gsm/` mirrors `GSM-fastapi`'s protocol/session/serial logic but in module form — if you're porting a fix from `GSM-fastapi` to `GSM-API` (or vice versa), check both, since they're not automatically kept in sync.

## Do Not Edit Manually

- `GSM-fastapi/sapot.db` — a checked-in SQLite database file; treat as generated/environment data, not source. (Consider flagging to the user that this probably shouldn't be committed at all.)
- `GSM-API/app/**/__pycache__/*.pyc` — compiled bytecode that is currently tracked in git; don't hand-edit, and don't add new `.pyc` files to commits (flag this as cleanup-worthy if you touch this area).

## Common Pitfalls

- Assuming `GSM-API/` is the live service — it isn't; `GSM-fastapi/` is what `deployment-scripts/server-GSM-api.service` actually runs.
- Making a fix in one service and forgetting the other exists — there's no shared code between them, so a protocol/session bug fixed in `GSM-fastapi` won't automatically apply to `GSM-API`.
- Editing Arduino firmware without access to the physical modem/bridge hardware to verify — flag this limitation rather than claiming the change was tested.

## Validation Checklist

- [ ] Confirmed which service (`GSM-fastapi/` vs `GSM-API/`) the task actually targets before editing
- [ ] `pyright` run (for `GSM-API/` changes) with no new errors
- [ ] No new hardcoded credentials or config defaults introduced
- [ ] If the fix applies to both services, both were updated (or the gap was explicitly noted to the user)
