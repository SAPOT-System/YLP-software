# Server Setup (bare-metal)

> **Recommended: [docker-setup.md](docker-setup.md)** — provisions MariaDB, Redis, and a TLS-terminating Nginx for you in one command, which this bare-metal path requires you to do by hand. Use this doc only if you specifically need to run the API outside Docker.

## Prerequisites

- Python 3.13
- [`uv`](https://docs.astral.sh/uv/) (Astral's Python package/venv manager — already used by production's `runserver.sh`; `pip install uv` or see the install docs)
- A running MariaDB instance, with an empty database created for the server to migrate into
- Redis (optional — used for rate limiting; see `REDIS_URL`)

## Configure

The server fails fast at import time if any of these are unset, each raising a `RuntimeError` naming
the variable:

| Variable | Read by |
|---|---|
| `DATABASE_URL` | `app/db_operations/auth.py`, `app/alembic/env.py` |
| `JWT_SECRET_KEY` | `app/db_operations/token.py` |
| `CORS_ALLOWED_ORIGINS` | `app/main.py` |
| `SERVER_ED25519_SEED` | `app/db_operations/signing.py` |
| `QA_API_TOKEN` | `app/api/testing.py`, only when `ENVIRONMENT=development` or `staging`; every state-changing `/testing/*` request must send it as `X-QA-Token` |

Copy `server/.env.example` to `server/.env` and fill it in. The example ships a usable value for
every variable above except the database host, so the only edits a local run needs are the two
marked below:

```dotenv
DATABASE_URL=mysql+pymysql://sapot:sapot@127.0.0.1:3306/sapot_dev   # changed from db:3306
REDIS_URL=redis://localhost:6379                                    # changed from redis:6379
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
SERVER_ED25519_SEED=<generate with: openssl rand -hex 32>
CORS_ALLOWED_ORIGINS=http://192.168.1.x:3000
ENVIRONMENT=development
QA_API_TOKEN=<any shared secret; required while ENVIRONMENT=development or staging>
```

> **`.env.example`'s shipped `DATABASE_URL`/`REDIS_URL` point at the Docker Compose service names (`db`/`redis`)** — they only resolve inside the Docker network. Change both to `127.0.0.1`/`localhost` (as above) for this bare-metal path.

> The shipped `JWT_SECRET_KEY` and `SERVER_ED25519_SEED` are committed placeholders. They are fine
> for a laptop, but regenerate both before the server is reachable by anyone else.

See [environment-config.md](../deployment/environment-config.md) for the full variable list and the repo-root `SECURITY.md` for why these are required.

## Run

`server/runserver.sh` is the supported entry point and the same script production uses. It creates
the venv, installs dependencies, applies migrations, and starts gunicorn, in that order:

```bash
cd server
./runserver.sh
```

This binds `127.0.0.1:8000` with 5 gunicorn/Uvicorn workers and writes to `server/logs/`.

### Running a reloading dev server instead

`runserver.sh` has no `--reload` mode. To iterate on code, do the same steps by hand and swap the
last one for Uvicorn:

```bash
cd server
uv venv app/venv                                                   # gitignored; not in a fresh clone
uv pip install --python app/venv/bin/python -r app/requirements.txt
app/venv/bin/alembic upgrade head                                  # see below, not optional
uv run app/venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### The migration step is not optional

The schema is owned by Alembic ([ADR 0007](../adr/0007-alembic-for-server-migrations.md)). The app
no longer calls `create_all()` at startup, so an unmigrated database gives you a server that boots
cleanly and then fails every query on a missing table. Run `alembic upgrade head` from `server/`
(not `server/app/`, because `alembic.ini` sets `prepend_sys_path = .`, so the `app` package is importable
only from `server/`) with `DATABASE_URL` set, and re-run it after any pull that adds a migration.

If you are pointing at a database created *before* Alembic was adopted, it has the tables but no
`alembic_version` row, and `upgrade` will fail trying to re-create them. Use the
[one-time cutover](../database/migrations.md#one-time-cutover-for-existing-databases) instead.

### TLS

The commands above serve plain HTTP. That is enough for `curl` and the Swagger UI, but **not for the
mobile app**, which speaks HTTPS in every build variant. Add `--ssl-certfile`/`--ssl-keyfile` to the
Uvicorn command and see [mobile-app-setup.md](mobile-app-setup.md#configure-tls-trust-for-local-development)
for issuing a certificate the app will actually trust:

```bash
uv run app/venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 \
  --ssl-certfile server.crt --ssl-keyfile server.key
```

> **Important:** For mobile app testing over LAN, the laptop running the server and the phone running the app must be on the same WiFi network.

## Verify

```bash
curl -s http://localhost:8000/version
```
Expect a JSON version payload.

With the server running, `GET http://<host>:8000/docs` serves the interactive Swagger UI, and `GET http://<host>:8000/openapi.json` serves the live OpenAPI spec — see [api/README.md](../api/README.md).

To confirm the database is actually migrated rather than merely reachable:

```bash
cd server && app/venv/bin/alembic current   # prints the applied revision, empty if never migrated
```

## Next

- [Mobile app setup](mobile-app-setup.md) to connect a client.
- [Admin frontend setup](admin-frontend-setup.md) to create the first administrator.
- [environment-config.md](../deployment/environment-config.md) for the full list of server environment variables (`GSM_SECRET`, `REDIS_URL`, etc.) to set before anything beyond local dev. Note its warning that `.env.example`'s `TLS_CERT`/`TLS_KEY` are stale: nothing reads them, so pass the certificate paths to Uvicorn directly as shown above.
