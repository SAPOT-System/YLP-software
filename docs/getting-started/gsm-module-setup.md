# GSM Module Setup

The SMS gateway (`GSM-module/GSM-fastapi/`) bridges the SAPOT server to a serial-attached GSM modem,
so users off the LAN can still be reached. Only needed if you are testing SMS fallback.

Two ways to run it. The [Docker stack](docker-setup.md) already builds and starts it as the
`gsm-fastapi` service. Use that unless you need the modem attached to a host that is not running
Docker, in which case follow this doc. For deploying it as a systemd service, see
[deployment/gsm-module.md](../deployment/gsm-module.md).

> `GSM-module/GSM-API/` is a separate, incomplete rewrite that no deployment path uses. Everything
> below refers to `GSM-fastapi/`.

## Prerequisites

- Python 3.13 (a `flake.nix` dev shell is provided: `GSM-module/GSM-fastapi/flake.nix`)
- [`uv`](https://docs.astral.sh/uv/) (Astral's Python package/venv manager — same tool the server's `runserver.sh` uses in production)
- A GSM modem attached via USB serial (default expected at `/dev/ttyACM0`, matching `SERIAL_PORT`'s default in `config.py`)
- Access to the same MariaDB instance the server uses (`DB_PATH`)

## Install

```bash
cd GSM-module/GSM-fastapi

# Option A: Nix dev shell (pinned Python 3.13 + venv tooling)
nix develop -L

# Option B: manual venv via uv
uv venv venv
uv pip install --python venv/bin/python -r requirements.txt
```

`run-api.sh` invokes `venv/bin/python3` by path, so the venv must be at `GSM-fastapi/venv/` either way.

## Configure

```bash
cp .env.example .env
```

| Variable | Default | Notes |
|---|---|---|
| `DB_PATH` | none, **required** | SQLModel URL for the server's MariaDB, e.g. `mysql+pymysql://sapot:sapot@127.0.0.1:3306/sapot_dev`. `config.py` raises `RuntimeError` at import if unset. (Its source comment says "SQLite"; that is stale; the deployed value is MariaDB.) |
| `GSM_SECRET` | `""` | Must match the server's `GSM_SECRET`. The two components authenticate each other's webhook calls with it via the `X-GSM-Secret` header. Left empty, the server rejects this gateway's calls. |
| `SAPOT_API_URL` | `http://localhost:8000` | Base URL of the SAPOT server this gateway forwards inbound SMS to (`POST /gsm/inbound`). The Docker service overrides it to `https://nginx`. |
| `SERIAL_PORT` | `/dev/ttyACM0` | Serial device the Arduino is on. `COM3`-style on Windows. |
| `SERIAL_BAUD` | `9600` | Must match `PC_BAUD` in the Arduino sketch. |
| `HOST` | `127.0.0.1` | Bind address. The Docker service overrides this to `0.0.0.0`. |
| `PORT` | `8000` | **Not read.** See [Run](#run) below. |
| `LOG_LEVEL` | `INFO` | |
| `SMS_BOT_USER_ID` | unset | UUID of the "SMS Bot" user in the SAPOT database. Inbound SMS is written into the app's conversation/message tables as coming from this user, so create it once on the server and paste the UUID here. |

See [environment-config.md](../deployment/environment-config.md) for the cross-component view.

## Run

```bash
./run-api.sh
# equivalent to:
uv run venv/bin/python3 main.py
```

The service listens on **port 8001**, always. `main.py` passes a literal `8001` to `uvicorn.run(...)`,
ignoring both `PORT` and `config.py`'s `8000` default. That hardcoded value is what keeps it clear of
the main SAPOT server on `8000`, and it matches the server's `_gsm_http_client`, whose `base_url` is
`http://localhost:8001` (`server/app/api/gsm.py`). Setting `PORT` yourself changes nothing except the
port printed in the startup log. See `GSM-module/CLAUDE.md`'s "Common Pitfalls".

## Verify

```bash
curl -s http://127.0.0.1:8001/health
```

`200` with `"gsm_ready": true` means the modem answered. `503` with `"status": "starting"` or
`"degraded"` means the API is up but the serial worker has not reached the modem. Check
`SERIAL_PORT` and that your user can open the device.

The startup log also echoes the resolved serial port, database URL, and listen address, which is the
quickest way to confirm the `.env` was picked up.

## Next

- [docker-setup.md](docker-setup.md) — the server must have a matching `GSM_SECRET` set for inbound/outbound SMS to authenticate.
- [data-flow.md](../architecture/data-flow.md#sms-fallback) — the end-to-end SMS fallback flow diagram.
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md#gsm-module-and-server-cant-authenticate-each-other): when the two sides reject each other's webhooks.
