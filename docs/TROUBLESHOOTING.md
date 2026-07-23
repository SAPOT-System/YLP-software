# Troubleshooting

Common failures when setting up or running SAPOT locally, grouped by symptom. See [getting-started/quickstart.md](getting-started/quickstart.md) for the setup path these assume.

---

## Server won't start or crashes on import

**Symptom:** `RuntimeError` raised immediately when running `uvicorn app.main:app`.

**Cause:** One of `DATABASE_URL`, `JWT_SECRET_KEY`, or `CORS_ALLOWED_ORIGINS` is unset. All three are required and fail fast at import time — see [SECURITY.md](../SECURITY.md) for why.

**Fix:** Set all three in `server/.env` (or your shell environment) before starting. See [environment-config.md](deployment/environment-config.md#fastapi-server-server) for the full list and [quickstart.md](getting-started/quickstart.md#2-start-the-server) for a working example.

---

## Server starts but MariaDB connection fails

**Symptom:** `sqlalchemy.exc.OperationalError` / `Can't connect to MySQL server` on startup, after the required-env-var check passes.

**Cause:** `DATABASE_URL` points to a MariaDB instance that isn't running, isn't reachable from this host, or has wrong credentials.

**Fix:**
```bash
mysql -u <user> -p -h <host> -e "SELECT 1;"   # confirm the DB is reachable with these exact credentials
```
If this fails, check MariaDB is running (`sudo systemctl status mariadb`) and that the user/password/host/port in `DATABASE_URL` match.

---

## Mobile app can't reach the server

**Symptom:** Registration/login hangs or shows a network error; nothing appears in the server's logs for the request.

**Cause (most common):** the phone and the server are not on the same Wi-Fi network, or `EXPO_PUBLIC_DEV_HOST` doesn't match the server's actual LAN IP.

**Fix:**
1. Confirm the server's LAN IP: `ip addr` (Linux) or `ifconfig` (macOS) on the server machine — look for the Wi-Fi/Ethernet interface IP, not `127.0.0.1`.
2. Confirm the phone is on the **same** Wi-Fi network as that machine (not a guest network, not cellular data).
3. Confirm `EXPO_PUBLIC_DEV_HOST` in `mobile-app/sapot-mobile-app/.env.local` matches that IP exactly, and that the app's in-app server settings (getting-started screen → Server Mode → settings icon) match too — both must agree.
4. Confirm the server is reachable from other devices, not just `localhost` — the [Docker setup](getting-started/server-docker-setup.md)'s Nginx publishes on every host interface by default; if running bare-metal instead (`uvicorn app.main:app --host 0.0.0.0 --port 8000`, see [server-setup.md](getting-started/server-setup.md)), binding to `127.0.0.1` makes it unreachable from any other device.

---

## CORS error in the admin frontend or a browser-based client

**Symptom:** Browser console shows a CORS error; the request never completes.

**Cause:** The calling origin isn't in `CORS_ALLOWED_ORIGINS`.

**Fix:** Add the exact origin (scheme + host + port) to the comma-separated `CORS_ALLOWED_ORIGINS` env var and restart the server. See [environment-config.md](deployment/environment-config.md#fastapi-server-server).

---

## `/testing/*` endpoints return 404 in dev

**Symptom:** A test helper endpoint like `/testing/test-make-admin` returns 404 even locally.

**Cause:** The testing router is gated behind `ENVIRONMENT=development` (see [SECURITY.md](../SECURITY.md#resolved-issues-fixed-in-code)) — it's unreachable unless that env var is set exactly to `development`.

**Fix:** Set `ENVIRONMENT=development` in `server/.env` for local dev only. **Never** set this in a production deployment.

---

## LAN peer discovery finds nothing (mDNS)

**Symptom:** Two devices on the same Wi-Fi network don't see each other in the app.

**Cause:** Some routers/networks isolate clients from each other ("AP/client isolation"), which blocks mDNS broadcast between devices even though both can reach the internet/server fine. Corporate and public Wi-Fi networks commonly enable this; a MikroTik router configured for a SAPOT deployment should not.

**Fix:** Confirm client isolation is disabled on the router/AP. As a workaround for local dev on an isolated network, use a phone hotspot or a dedicated router instead.

---

## GSM module and server can't authenticate each other

**Symptom:** SMS send/receive fails; server logs show a rejected `X-GSM-Secret` header, or the GSM module logs show the reverse.

**Cause:** `GSM_SECRET` differs between the two components' env files.

**Fix:** Set the exact same value for `GSM_SECRET` in both `server/.env` and the GSM module's env file. See [gsm-module-setup.md](getting-started/gsm-module-setup.md#configure).

---

## Port collision between the server and GSM module

**Symptom:** GSM module fails to bind, or one of the two services silently doesn't respond, when both run on the same host.

**Cause:** The GSM module's `config.py` documents a `PORT` default of `8000`, matching the server's default — but `PORT` is not actually read: `GSM-fastapi/main.py` hardcodes `uvicorn.run(..., port=8001, ...)` regardless of the variable. In practice the two services don't collide because the GSM module always binds `8001`. See [environment-config.md](deployment/environment-config.md#gsm-module-gsm-modulegsm-fastapi).

**Fix:** No action needed for the port itself — the GSM module always listens on `8001`. If you still see a collision, confirm nothing else on the host is bound to `8001`, and ensure the server's `_gsm_http_client` base URL points at `8001`.

---

## Still stuck?

Check [SECURITY.md](../SECURITY.md) for known required env vars, [environment-config.md](deployment/environment-config.md) for the full variable reference across every component, and [architecture/system-overview.md](architecture/system-overview.md) for how the components are expected to talk to each other.
