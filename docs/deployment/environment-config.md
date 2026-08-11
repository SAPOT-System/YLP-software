# Environment Configuration

All SAPOT components are configured via environment variables. This document lists every variable, its component, default, and whether it is required in production.

---

## FastAPI Server (`server/`)

| Variable | Default in source | Production requirement |
|---|---|---|
| `DATABASE_URL` | None — required, raises `RuntimeError` at import if unset | **MUST** be set (MariaDB connection string) |
| `JWT_SECRET_KEY` | None — required, raises `RuntimeError` at import if unset | **MUST** be set — generate a strong random secret |
| `CORS_ALLOWED_ORIGINS` | None — required, raises `RuntimeError` at startup if unset | **MUST** be set — comma-separated explicit origin allowlist |
| `ENVIRONMENT` | `production` | One of `development`, `staging`, or `production`. `development` and `staging` enable the `/testing/*` router; never use either in a production deployment. Any other value raises `ValueError` at import time. |
| `QA_API_TOKEN` | None — required, raises `RuntimeError` at import if unset **when `ENVIRONMENT=development` or `staging`** | Required in QA-enabled environments; the `X-QA-Token` header value protects `/testing/reset` and `/testing/login-as/{handle}` |
| `REDIS_URL` | `redis://localhost:6379` | Set if Redis is on a non-default host/port |
| `SERVER_ED25519_SEED` | `None` (server key signing disabled if unset) | Set to enable server-signed peer keys |
| `GSM_SECRET` | `""` (empty — webhook auth disabled) | Set to a shared secret to authenticate GSM module webhooks |

See [SECURITY.md](../../SECURITY.md) for why `DATABASE_URL`, `JWT_SECRET_KEY`, and `CORS_ALLOWED_ORIGINS` became required.

> **Deployment note:** `ENVIRONMENT` is validated at import time. A typo such as `Development` or `dev` stops the server rather than silently applying production behaviour. Correct the value in the service environment file, then restart the service.

> **Note:** `server/.env.example` has since been synced to include `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
> `ENVIRONMENT`, and `REDIS_URL` (previously flagged here as missing). It still lists `TLS_CERT`/`TLS_KEY`,
> which are **not** read anywhere in `server/app/*.py` (verified via grep for `os.environ`/`os.getenv`)
> and are not referenced by `server/runserver.sh`'s gunicorn invocation — they remain stale/aspirational,
> kept for a future reverse-proxy/TLS-termination setup.

### Recommended production `server.env`

```dotenv
DATABASE_URL=mysql+pymysql://<user>:<rotated-password>@127.0.0.1:3306/sapot_db
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
CORS_ALLOWED_ORIGINS=http://192.168.0.100:3000
ENVIRONMENT=production
REDIS_URL=redis://127.0.0.1:6379/0
SERVER_ED25519_SEED=<generate with: openssl rand -hex 32>
GSM_SECRET=<shared secret with GSM module>
```

---

## GSM Module (`GSM-module/GSM-fastapi/`)

> **Note:** `GSM-module/` also contains a separate, undocumented `GSM-API/` directory with its own
> app code and a committed `.env.example` (`SAPOT_API_URL`, `GSM_SECRET` only). It is not referenced
> by any doc, systemd unit, or setup guide in this repo — `GSM-fastapi/` is the deployed component
> (see [gsm-module.md](gsm-module.md) and [gsm-module-setup.md](../getting-started/gsm-module-setup.md)).
> Not resolved as part of this pass; flagged for a follow-up doc/architecture decision.

| Variable | Default | Purpose |
|---|---|---|
| `SERIAL_PORT` | `/dev/ttyACM0` | USB serial device path |
| `SERIAL_BAUD` | `9600` | Serial baud rate |
| `DB_PATH` | `mysql+pymysql://sapot:sapot@localhost:3306/sapot_db` (hardcoded default in `config.py`) | MariaDB connection string |
| `HOST` | `127.0.0.1` | FastAPI bind host |
| `PORT` | `8000` (code default in `config.py`), but **not actually read** — `GSM-fastapi/main.py` hardcodes `uvicorn.run(..., port=8001, ...)` regardless of this variable. The service always listens on `8001` in practice, which is what avoids colliding with the main SAPOT server on `127.0.0.1:8000` — not the `PORT` variable. | Not a real configuration knob today — see `GSM-module/CLAUDE.md`'s "Common Pitfalls" |
| `LOG_LEVEL` | `INFO` | Python logging level (`config.py`) |
| `SAPOT_API_URL` | `http://localhost:8000` | Base URL the GSM module uses to call back into the SAPOT server (`database.py`) — must match wherever the server actually listens |
| `GSM_SECRET` | `""` (empty — webhook auth disabled) | Shared secret sent as `X-GSM-Secret` on both directions of the server↔GSM webhook calls (`database.py`). **Must match the server's `GSM_SECRET`** (see above) |
| `SMS_BOT_USER_ID` | unset | User ID the GSM module attributes inbound SMS-originated messages to, when the sender can't be resolved to a registered user (`database.py`) |

### Recommended production `gsm.env`

```dotenv
SERIAL_PORT=/dev/ttyACM0
SERIAL_BAUD=9600
DB_PATH=mysql+pymysql://<user>:<password>@127.0.0.1:3306/sapot_db
HOST=127.0.0.1
PORT=8001  # harmless to set, but has no real effect — main.py always binds 8001
LOG_LEVEL=INFO
SAPOT_API_URL=https://<sapot-server-host>
GSM_SECRET=<same shared secret as server's GSM_SECRET>
SMS_BOT_USER_ID=<uuid of the SMS bot user, if applicable>
```

---

## Mobile App (`mobile-app/sapot-mobile-app/`)

Set in EAS project secrets or a local `.env` file (not committed).

| Variable | Purpose | When needed |
|---|---|---|
| `APP_VARIANT` | Build variant: `development`, `preview`, or unset for production | EAS build |
| `SERVER_CA` | Base64-encoded **private CA** PEM, materialized into `server_ca.pem` at prebuild by `app.config.ts`'s `withServerCa` | EAS cloud builds only |
| `EXPO_PUBLIC_DEV_HOST` | Dev-only server hostname/IP used by `config/runtime.ts` to build the API/WS/tile-server URLs (`https://<DEV_HOST>`, `wss://<DEV_HOST>`) | `__DEV__` builds only |
| `EXPO_PUBLIC_SERVER_VERIFY_KEY` | Public key used to verify the server's identity/signature (`config/runtime.ts` → `getServerVerifyKey()`) | All builds, if server signing is enabled |
| `EXPO_PUBLIC_ENABLED_LOG_MODULES` | Comma-separated log scopes; unset = all | Development only |
| `EXPO_PUBLIC_LOG_TO_FILE` | Set to `1` to force file logging in dev (always on in non-dev builds) | Development only |
| `EXPO_PUBLIC_LOG_TO_LAPTOP` | Set to `0` to disable streaming logs to the dev laptop collector; on by default outside Jest | Development only |
| `EXPO_PUBLIC_LOG_SERVER_PORT` | Port the app streams dev logs to; must match `LOG_SERVER_PORT` on the laptop collector (default `19000`) | Development only |
| `LOG_SERVER_PORT` | Port `scripts/dev-log-server.js` (the laptop-side log collector) listens on; default `19000` | Development only, laptop-side |
| `ANDROID_KEYSTORE_PATH` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Android release-signing keystore credentials | EAS production builds only |
| `SENTRY_AUTH_TOKEN` | Uploads source maps/debug symbols to Sentry during build | EAS builds with Sentry integration |
| `EXPO_PUBLIC_DEBUG_MENU` | Set to `1` to opt a non-dev build (e.g. `preview`/QA) into the developer debug menu (`config/debug.ts`). Always on in `__DEV__` regardless of this flag; must never be set on the `production` EAS profile | Preview/QA builds only |

> Every variable above except `LOG_SERVER_PORT` (laptop-side only) is present in
> `mobile-app/sapot-mobile-app/.env.example`. `EXPO_PUBLIC_ENABLED_LOG_MODULES` additionally
> ships in the separate `.env.development.local.example`, which is the only variable that file
> carries. This repo-root table is a cross-component summary; for full mobile env-var detail and
> per-file breakdown, see [ENV_CONFIG.md](../../mobile-app/sapot-mobile-app/docs/ENV_CONFIG.md).
>
> There is no `EXPO_PUBLIC_API_URL` in this app — the API base URL is not env-configurable at
> runtime. It is derived in `config/runtime.ts` from `EXPO_PUBLIC_DEV_HOST` (dev) or the
> build-time `SERVER_NAME` constant `server.sapot.lan` (preview/production), with an optional
> persisted host override. The TLS variable is `SERVER_CA` (a CA, not a leaf cert).

---

## Admin Frontend (`admin-frontend/sapot-admin/`)

| Variable | Purpose | Required |
|---|---|---|
| `API_DOMAIN` | SAPOT server base URL, read server-side only (`api/fetch.ts`, `api/login.ts`, `app/api/**/route.ts`, `actions/auth.ts`) — **not** prefixed `NEXT_PUBLIC_`, so it never reaches the client bundle | Yes |
| `NEXT_PUBLIC_MAP_STYLE` | MapLibre tile style URL (`ui/components/MapLibre.tsx`) | Yes |
| `NEXT_PUBLIC_WEBSOCKET_DOMAIN` | WebSocket server domain (`lib/ws/Websocketmanager.ts`, non-null asserted — required) | Yes |
| `NODE_ENV` | Toggles the `secure` flag on auth cookies (production vs dev) | Set by the Node runtime; not usually hand-set |

Set in `.env.local` (not committed) or the host service manager. `admin-frontend/sapot-admin/.env.example`
also lists `NODE_EXTRA_CA_CERTS`, a path to the server's CA certificate — this is consumed by Node's
own TLS stack (so the app trusts it without disabling verification), not read via `process.env` in
app code.

---

## Loading environment variables in production

For systemd-managed services, use `EnvironmentFile=` pointing to a restricted file:

```ini
[Service]
EnvironmentFile=/etc/sapot/server.env
```

Restrict access to the env file:

```bash
sudo chmod 600 /etc/sapot/server.env
sudo chown sapot:sapot /etc/sapot/server.env
```
