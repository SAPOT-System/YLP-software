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

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyACM0` | USB serial device for the Arduino/GSM modem |
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

Create `/etc/systemd/system/server-GSM-api.service`:

```ini
[Unit]
Description=SAPOT GSM API
After=network.target

[Service]
WorkingDirectory=/home/sapot/YLP-software/GSM-module/GSM-fastapi
ExecStart=/home/sapot/YLP-software/GSM-module/GSM-fastapi/venv/bin/python3 main.py
Restart=always
User=sapot
EnvironmentFile=/etc/sapot/gsm.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable server-GSM-api
sudo systemctl start server-GSM-api
```

---

## Serial port permissions

The service user must have access to the serial device:

```bash
sudo usermod -aG dialout sapot
```

Log out and back in for the group change to take effect.

---

> **TODO (human input required):** Document the Arduino firmware version, wiring diagram, and SIM card APN configuration.
