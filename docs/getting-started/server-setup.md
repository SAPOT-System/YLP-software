# Server Setup (bare-metal)

> **Recommended: [server-docker-setup.md](server-docker-setup.md)** — provisions MariaDB, Redis, and a TLS-terminating Nginx for you in one command, which this bare-metal path requires you to do by hand. Use this doc only if you specifically need to run the API outside Docker.

Source: `mobile-app/sapot-mobile-app/README.md` (Tester Guide section) — the server's own `README.org` has no run instructions today.

## Prerequisites

- Python 3.13
- [`uv`](https://docs.astral.sh/uv/) (Astral's Python package/venv manager — already used by production's `runserver.sh`; `pip install uv` or see the install docs)
- A running MariaDB instance
- Redis (optional — used for rate limiting; see `REDIS_URL`)

## Create the virtualenv

`server/app/venv/` is gitignored — it isn't part of a fresh clone, so create it before the first run:

```bash
cd server
uv venv app/venv
```

## Configure

The server requires `DATABASE_URL`, `JWT_SECRET_KEY`, and `CORS_ALLOWED_ORIGINS` — it raises `RuntimeError` at import time if any are unset. Copy `server/.env.example` to `server/.env` and fill it in:

```dotenv
DATABASE_URL=mysql+pymysql://<user>:<password>@127.0.0.1:3306/sapot_db
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
CORS_ALLOWED_ORIGINS=http://192.168.1.x:3000
ENVIRONMENT=development
```

> **`.env.example`'s shipped `DATABASE_URL`/`REDIS_URL` point at the Docker Compose service names (`db`/`redis`)** — they only resolve inside the Docker network. Change both to `127.0.0.1`/`localhost` (as above) for this bare-metal path.

See [environment-config.md](../deployment/environment-config.md) for the full variable list and [SECURITY.md](../../SECURITY.md) for why these are required.

> Don't want to install MariaDB/Redis locally? [deployment/server.md#run-with-docker](../deployment/server.md#run-with-docker) documents a `docker compose` stack that provides both plus a TLS-terminating Nginx, without hand-managing local services.

## Run

```bash
cd server
uv pip install --python app/venv/bin/python -r app/requirements.txt
uv run app/venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **Important:** For mobile app testing over LAN, the laptop running the server and the phone running the app must be on the same WiFi network.

## Verify

With the server running, `GET http://<host>:8000/docs` serves the interactive Swagger UI, and `GET http://<host>:8000/openapi.json` serves the live OpenAPI spec — see [api/README.md](../api/README.md).

## Next

- [Mobile app setup](mobile-app-setup.md) to connect a client.
- [environment-config.md](../deployment/environment-config.md) for the full list of server environment variables (`JWT_SECRET_KEY`, `GSM_SECRET`, etc.) to set before anything beyond local dev.
