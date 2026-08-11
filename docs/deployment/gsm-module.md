# GSM Module Deployment

The GSM module (`GSM-module/GSM-fastapi/`) is a FastAPI application that bridges an Arduino-connected SIM800L/SIM900 GSM modem to the SAPOT server's SMS webhook. It exposes SMS send/receive endpoints and forwards inbound SMS to the main server.

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
SERIAL_PORT=/dev/ttyACM0 python3 main.py
```

Or use the helper script:

```bash
bash run-api.sh
```

`main.py` starts FastAPI on `settings.host` (from `config.py`, default `127.0.0.1`) — **but the port is hardcoded to `8001`** in the `uvicorn.run(...)` call, not read from `settings.port`/`PORT`. Setting `PORT` has no effect on the bound port (it only affects the startup log line, which will report the wrong port — see `GSM-module/CLAUDE.md`'s "Common Pitfalls"). `HOST` is honored via `config.py`.

### Docker (dev/test alternative)

The root `docker-compose.yml` (see [docker-setup.md](../getting-started/docker-setup.md))
includes a `gsm-fastapi` service alongside the rest of the stack. It passes through the host's
`/dev/ttyACM0` device, so it only starts successfully on a machine with the modem attached — set
`HOST=0.0.0.0` inside the container (already set in the compose service) so the published port is
actually reachable from outside the container.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyACM0` | USB serial device for the Arduino/GSM modem |
| `SMS_SEND_QUEUE_MAXSIZE` | `10` | Maximum outbound requests waiting behind the one in-flight request. Must be an integer greater than or equal to `1`. |
| `SERIAL_BAUD` | `9600` | Serial baud rate |
| `DB_PATH` | `mysql+pymysql://sapot:sapot@localhost:3306/sapot_db` | Database connection (hardcoded default — override in production) |
| `HOST` | `127.0.0.1` | FastAPI bind host |
| `PORT` | `8000` in `config.py`, but **not actually used** — `main.py` hardcodes port `8001` regardless of this variable | Documented for completeness only; do not rely on it to change the bound port |

> **Security note:** `DB_PATH` has a hardcoded default with plaintext credentials. Always set it explicitly in production. See [secrets-management.md](secrets-management.md).

---

## Database

The module ships a pre-seeded SQLite development database at `GSM-module/GSM-fastapi/sapot.db`. Replace it with an empty database or configure `DB_PATH` to point to the production MariaDB instance before deploying.

---

## Production systemd

For a first bare-metal host, copy the tracked reference unit `deployment-scripts/server-GSM-api.service` to `/etc/systemd/system/server-GSM-api.service`. Then reload systemd before enabling or starting it. The tracked unit is not installed automatically.

```bash
sudo cp deployment-scripts/server-GSM-api.service /etc/systemd/system/server-GSM-api.service
sudo systemctl daemon-reload
sudo systemctl enable server-GSM-api
sudo systemctl start server-GSM-api
```

## Outbound capacity and overload

The intended deployment accepts 10 waiting outbound requests and one in-flight serial request by default. Configure `SMS_SEND_QUEUE_MAXSIZE` before the first deployment to change the waiting capacity. When the queue is full, `POST /sms/send` returns HTTP 503 with `QUEUE_FULL`; callers should use bounded backoff and must not retry in a tight loop. Saturation does not cancel an accepted in-flight SMS.

## Queue diagnostics

| Field | Meaning |
|---|---|
| `outbound_queue_depth` | Accepted requests waiting for the sender |
| `outbound_queue_capacity` | Configured maximum waiting requests |
| `outbound_in_flight` | Whether a request is being written or awaiting modem confirmation |
| `queue_depth` | Existing inbound queue depth, not outbound capacity |

## Graceful shutdown

Shutdown first rejects new work, then resolves queued unsent work with `SERVICE_STOPPING`. It does not relabel the in-flight SMS, which remains active until its modem outcome or sender-owned timeout. The tracked systemd unit and both Compose files set a 150-second stop budget: 5 seconds serial write timeout + 120 seconds maximum internal confirmation timeout + two joins of up to 5 seconds = 135 seconds, plus a 15-second service-manager margin. Recalculate this budget whenever those timeout or join constants change.

---

## Serial port permissions

The service user must have access to the serial device:

```bash
sudo usermod -aG dialout sapot
```

Log out and back in for the group change to take effect.

---

> **TODO (human input required):** Document the Arduino firmware version, wiring diagram, and SIM card APN configuration.
