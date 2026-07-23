# GSM Module Setup

> **Note:** No setup doc exists for this component anywhere else in the repo — the steps below are newly authored from `GSM-module/GSM-fastapi/config.py`, `requirements.txt`, `run-api.sh`, and `flake.nix`, not copied from an existing README.

## Prerequisites

- Python 3.13 (a `flake.nix` dev shell is provided: `GSM-module/GSM-fastapi/flake.nix`)
- A GSM modem attached via USB serial (default expected at `/dev/ttyACM0`, matches the `SERIAL_PORT` default in `config.py`)
- Access to the same MariaDB instance the server uses (`DB_PATH`)

## Install

```bash
cd GSM-module/GSM-fastapi

# Option A: Nix dev shell (pinned Python 3.13 + venv tooling)
nix develop -L

# Option B: manual venv
python3.13 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Configure

Set env vars before running (see [environment-config.md](../deployment/environment-config.md) for the full list and defaults):

```dotenv
SERIAL_PORT=/dev/ttyACM0
DB_PATH=mysql+pymysql://<user>:<password>@127.0.0.1:3306/sapot_db
GSM_SECRET=<same shared secret configured on the server>
SAPOT_API_URL=https://<sapot-server-host>
```

`GSM_SECRET` must match the server's `GSM_SECRET` — the two components authenticate each other's webhook calls with this shared secret via the `X-GSM-Secret` header.

## Run

```bash
./run-api.sh
# equivalent to:
source venv/bin/activate && python3 main.py
```

This binds `HOST=127.0.0.1` on port `8001` — `main.py` hardcodes port `8001` in its `uvicorn.run(...)` call regardless of `PORT`/`config.py`'s default (which is `8000`, matching the main server). That hardcoded `8001` is what already avoids colliding with the main SAPOT server on port `8000`; setting `PORT` yourself has no effect on the bound port (see `GSM-module/CLAUDE.md`'s "Common Pitfalls"). This does match the server's `_gsm_http_client` base URL of `http://localhost:8001` in `server/app/api/gsm.py`.

## Next

- [server-docker-setup.md](server-docker-setup.md) — the server must have a matching `GSM_SECRET` set for inbound/outbound SMS to authenticate.
- [data-flow.md](../architecture/data-flow.md#sms-fallback) — the end-to-end SMS fallback flow diagram.
