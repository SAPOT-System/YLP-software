# GSM Module Deployment

The GSM module (`GSM-module/GSM-fastapi/`) is a FastAPI application that bridges an Arduino-connected SIM800L/SIM900 GSM modem to the SAPOT server's SMS webhook. It exposes SMS send/receive endpoints and forwards inbound SMS to the main server.

---

## Hardware requirements

- Arduino with SIM800L or SIM900 GSM shield
- USB-to-serial connection from Arduino to the Linux host
- Default serial port: `/dev/ttyACM0` (configurable via `SERIAL_PORT`)

### Identifying the correct serial port

`/dev/ttyACM0` is a default, not a guarantee — the actual device node depends on what else is plugged into the host and the order devices were connected. Before setting `SERIAL_PORT`:

```bash
# 1. List candidate serial devices before and after plugging in the modem
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null

# 2. Plug in the Arduino/GSM modem, then check kernel messages for the new device
dmesg | tail -20
# look for a line like: "cdc_acm 1-1:1.0: ttyACM0: USB ACM device"
```

If multiple `ttyACM*`/`ttyUSB*` devices are present (e.g. another USB-serial peripheral on the same host), unplug the modem, re-run step 1, plug it back in, and diff the device list to find which node appeared. Set `SERIAL_PORT` to that device.

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

`main.py` starts FastAPI using host/port from `config.py` (default `127.0.0.1:8000`). Override with environment variables.

---

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyACM0` | USB serial device for the Arduino/GSM modem |
| `SERIAL_BAUD` | `9600` | Serial baud rate |
| `DB_PATH` | `mysql+pymysql://sapot:sapot@localhost:3306/sapot_db` | Database connection (hardcoded default — override in production) |
| `HOST` | `127.0.0.1` | FastAPI bind host |
| `PORT` | `8000` | FastAPI bind port |

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
