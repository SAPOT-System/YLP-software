# GSM Module Deployment

The GSM module (`GSM-module/GSM-fastapi/`) is a FastAPI application that bridges an Arduino-connected SIM800L/SIM900 GSM modem to the SAPOT server's SMS webhook. It exposes send, message-history, and health endpoints, then forwards serially received SMS to the main server.

---

## Hardware requirements

- Arduino with SIM800L or SIM900 GSM shield
- USB-to-serial connection from Arduino to the Linux host
- Default serial port: `/dev/ttyACM0` (configurable via `SERIAL_PORT`)

---

## Development / startup

```bash
cd GSM-module/GSM-fastapi/
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and set DB_PATH, GSM_SECRET, SAPOT_API_URL, and the serial device.
python3 main.py
```

Or use the helper script:

```bash
bash run-api.sh
```

`main.py` starts FastAPI on `settings.host` (from `config.py`, default `127.0.0.1`), but the port is hardcoded to `8001` in the `uvicorn.run(...)` call. It does not read `settings.port` or `PORT`. Setting `PORT` only changes the startup log line. `HOST` is honored via `config.py`.

### Docker (dev/test alternative)

The root `docker-compose.yml` (see [docker-setup.md](../getting-started/docker-setup.md)) includes a `gsm-fastapi` service alongside the rest of the stack. The base file does not pass through `/dev/ttyACM0`, which lets development stacks start without GSM hardware. Add `docker-compose.gsm-hardware.yml` when the modem is attached. The service listens on all interfaces inside its container, but Compose publishes port 8001 only on host loopback because the direct API is unauthenticated.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyACM0` | USB serial device for the Arduino/GSM modem |
| `SMS_SEND_QUEUE_MAXSIZE` | `10` | Maximum outbound requests waiting behind the one in-flight request. Accepts `1` through `20`. |
| `SERIAL_BAUD` | `9600` | Serial baud rate |
| `DB_PATH` | None | Required database connection URL; startup fails when unset |
| `HOST` | `127.0.0.1` | FastAPI bind host |
| `PORT` | `8000` in `config.py`, but not used for binding | `main.py` always binds port `8001`; do not rely on this setting |
| `SAPOT_API_URL` | `http://localhost:8000` | Base URL for authenticated inbound callbacks to the main server |
| `GSM_SECRET` | Empty string | Must match the main server value in production |

> **Security note:** Set `DB_PATH` and `GSM_SECRET` explicitly before startup. Never deploy the placeholder credentials from `.env.example`. See [secrets-management.md](secrets-management.md).

---

## Database

The committed `GSM-module/GSM-fastapi/sapot.db` file is stale and unused. Set `DB_PATH` to the production MariaDB instance before deploying.

---

## Production systemd

The tracked unit loads `/etc/sapot/gsm.env` through `EnvironmentFile=`. Provision that restricted file from the committed example before installing the unit. The tracked unit is not installed automatically.

```bash
sudo install -d -m 0700 -o sapot -g sapot /etc/sapot
sudo install -m 0600 -o sapot -g sapot \
  GSM-module/GSM-fastapi/.env.example /etc/sapot/gsm.env
sudoedit /etc/sapot/gsm.env
sudo cp deployment-scripts/server-GSM-api.service /etc/systemd/system/server-GSM-api.service
sudo systemctl daemon-reload
sudo systemctl enable server-GSM-api
sudo systemctl start server-GSM-api
```

This is a manual deployment step. Repository updates do not install the unit or refresh `/etc/sapot/gsm.env`; repeat the copy and restart the service when either artifact changes.

## Outbound capacity and overload

The intended deployment accepts 10 waiting outbound requests and one active serial request by default. Configure `SMS_SEND_QUEUE_MAXSIZE` from `1` through `20` before startup to change the waiting capacity. The upper bound keeps enough of FastAPI's default 40-thread worker pool available to reject overload. When the queue is full, `POST /sms/send` returns HTTP 503 with `QUEUE_FULL`; callers should use bounded backoff and must not retry in a tight loop.

## Queue diagnostics

| Field | Meaning |
|---|---|
| `outbound_queue_depth` | Accepted requests waiting for the sender |
| `outbound_queue_capacity` | Configured maximum waiting requests |
| `outbound_in_flight` | Whether a request is being written or awaiting modem confirmation |
| `queue_depth` | Existing inbound queue depth, not outbound capacity |

## Shutdown behavior

Shutdown closes admission before draining waiting work. Queued and active requests resolve with `SERVICE_STOPPING`, allowing blocked callers to return without extending the service manager's normal stop budget.

---

## Serial port permissions

The service user must have access to the serial device:

```bash
sudo usermod -aG dialout sapot
```

Log out and back in for the group change to take effect.

---

> **TODO (human input required):** Document the Arduino firmware version, wiring diagram, and SIM card APN configuration.
