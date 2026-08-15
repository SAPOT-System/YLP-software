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

Physical modem hardware is required to deliver messages through a carrier. For Linux-only local
outbound-flow testing, `mock_modem.py` can replace the serial hardware with a virtual port. It does
not replace the database or shared-secret configuration: `.env` must still provide `DB_PATH` and
`GSM_SECRET`.

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
| `DB_PATH` | none, **required** | SQLModel URL for the server's MariaDB, e.g. `mysql+pymysql://sapot:sapot@127.0.0.1:3306/sapot_dev`. `config.py` raises `RuntimeError` at import if unset. |
| `GSM_SECRET` | None | Required at startup and must match the server's `GSM_SECRET`. Both services send it as `X-GSM-Secret` when calling the other service. |
| `SAPOT_API_URL` | `http://localhost:8000` | Base URL of the SAPOT server this gateway forwards inbound SMS to (`POST /gsm/inbound`). The Docker service overrides it to `https://nginx`. |
| `SERIAL_PORT` | `/dev/ttyACM0` | Serial device the Arduino is on. `COM3`-style on Windows. |
| `SERIAL_BAUD` | `9600` | Must match `PC_BAUD` in the Arduino sketch. |
| `HOST` | `127.0.0.1` | Bind address. The Docker service overrides this to `0.0.0.0`. |
| `PORT` | `8000` | **Not read.** See [Run](#run) below. |
| `LOG_LEVEL` | `INFO` | |
| `SMS_SEND_QUEUE_MAXSIZE` | `10` | Maximum waiting outbound SMS requests. Values from `1` through `20` preserve FastAPI worker capacity; startup fails for other values. |
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

## Test two-way SMS flow without a modem

The virtual modem exercises the unchanged serial worker and outbound API flow without an Arduino,
SIM card, or carrier connection. It uses a POSIX pseudo-terminal (PTY), so this workflow is intended
for Linux host development, not Windows. For Docker Compose, use the
[`docker-compose.gsm-emulator.yml`](../../docker-compose.gsm-emulator.yml) overlay instead of passing
a host PTY into the container.

In one terminal, start the emulator and copy the printed port path:

```bash
cd GSM-module/GSM-fastapi
python mock_modem.py
```

```text
Virtual modem port: /dev/pts/3
Run the gateway with: SERIAL_PORT=/dev/pts/3 python main.py
```

Before starting the gateway, put that exact path in `GSM-module/GSM-fastapi/.env`. Keep the required
`DB_PATH` and `GSM_SECRET` values there too.

```dotenv
# Development-only PTY created by mock_modem.py. Replace this value each time
# the emulator is restarted because its /dev/pts path can change.
SERIAL_PORT=/dev/pts/3
```

Start the gateway in a second terminal:

```bash
cd GSM-module/GSM-fastapi
python main.py
```

Open `http://127.0.0.1:8002` to use the virtual phone. Enter any E.164 phone number, such as
`+639171234567`, then send through the normal SAPOT API. The accepted message appears as an incoming
message from **SAPOT Gateway**. Reply in the browser to inject `SMS_RECEIVED` into the unchanged serial
worker, so account checks, `[target]` sessions, message logging, and callbacks still run in the gateway.

The controls intentionally model the Arduino-facing boundary:

| Control | Effect |
| --- | --- |
| SIM | Removing it emits `SIM_MISSING`; restoring a working modem emits `GSM_READY` then `NETWORK_OK`. |
| Network | Losing it emits `NETWORK_LOST`; restoring it emits `GSM_READY` then `NETWORK_OK`. |
| Outbound result | `success` accepts and displays a message, `NO_PROMPT` returns `SMS_FAILED`, and `TIMEOUT` leaves the gateway send waiting for its normal timeout. |

Browser replies are disabled while the SIM or network is unavailable. The emulator replaces inbound
pipe characters with `/`, replaces newlines with spaces, and caps replies at the firmware's 127-byte
inbound buffer limit. It keeps messages only in memory, so restarting it clears every virtual inbox.

For Docker Compose, run:

```bash
./docker/up.sh -f docker-compose.yml -f docker-compose.gsm-emulator.yml up --build -d
```

The overlay publishes the virtual phone only at `127.0.0.1:${VIRTUAL_PHONE_PORT:-8002}` and runs it in
the same container as the gateway because PTY paths do not cross container boundaries. Do not put the
host's `/dev/pts/<n>` path in `.env` for this workflow: `run-with-mock-modem.sh` creates the PTY inside
the container and overrides `SERIAL_PORT` for the gateway process. You can restart only the gateway and
reuse the same PTY path while the emulator continues running.

The normal gateway image is a production target that excludes the virtual modem, virtual phone, and
their startup script. The emulator overlay explicitly selects a separate emulator target, so it cannot
be activated by the standard production image or command.

For a physical modem in Docker, set the host device path in `GSM-module/GSM-fastapi/.env` before using
the hardware overlay. The `docker/up.sh` wrapper reads this value and uses it both as the gateway's
`SERIAL_PORT` and as the Docker device mapping.

```dotenv
# Physical Arduino/GSM modem attached to the Docker host.
SERIAL_PORT=/dev/ttyACM0
```

```bash
./docker/up.sh -f docker-compose.yml -f docker-compose.gsm-hardware.yml up --build -d
```

Use a host device such as `/dev/ttyACM0` or `/dev/ttyUSB0` here. A `/dev/pts/<n>` path is valid only
for direct-host testing; Docker cannot pass it through as a hardware device.

An emulator success means that the simulated modem accepted the request at the Arduino protocol boundary.
It does not mean a carrier accepted the SMS or that a physical phone received it.

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

- [docker-setup.md](docker-setup.md): the server must have a matching `GSM_SECRET` for inbound GSM callbacks.
- [data-flow.md](../architecture/data-flow.md#sms-fallback) — the end-to-end SMS fallback flow diagram.
- [TROUBLESHOOTING.md](../TROUBLESHOOTING.md#server-rejects-gsm-inbound-callbacks): when the server rejects the gateway's callback secret.
