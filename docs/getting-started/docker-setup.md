# Docker Setup (Full Stack)

Runs the whole SAPOT stack — server (`db`, `redis`, `api`, `certgen`, `nginx`), `admin` (admin dashboard), `tileserver`, and `gsm-fastapi` (SMS gateway) — via the root `docker-compose.yml`. Alternative to setting up each component individually by hand: [server-setup.md](server-setup.md) (bare-metal server), [admin-frontend setup](../deployment/admin-frontend.md), [tileserver setup](../deployment/tileserver.md), [gsm-module setup](gsm-module-setup.md). All commands below run from the **repo root**, not `server/`.

This is the developer stack. For a disconnected production site, build and use an [offline Docker bundle](../deployment/docker-bundle.md).

## Prerequisites

- Docker + Docker Compose v2

## Running under WSL

Everything below works from a WSL2 distro's bash shell as-is — use `docker/up.sh` (not `up.ps1`, which is for plain PowerShell). Set up in this order:

1. **Install Docker Engine inside the distro** — use the [official Docker Engine install steps](https://docs.docker.com/engine/install/) for your distro (e.g. Ubuntu), not Docker Desktop. A fresh WSL install has no `docker` command otherwise.
2. **Start the Docker daemon** — `sudo service docker start` (or enable it via systemd if your distro has it enabled: `sudo systemctl enable --now docker`).
3. **Confirm `python3` is installed** in the distro — the steps above assume it's already present.
4. **Before connecting a mobile client or another machine on the LAN, check WSL2's networking mode** — `docker/up.sh` auto-detects a LAN IP for the dev TLS cert's SAN, but under WSL2's default NAT networking it detects the WSL2 virtual adapter's IP, not the Windows host's real LAN IP. `curl https://localhost/version` from WSL or Windows still works either way, but a phone running the [mobile app](mobile-app-setup.md) — or any other machine on the same network — won't be able to reach the server at that IP unless you enable WSL2 **mirrored networking** (Windows 11):
   - In the Windows user folder (`%UserProfile%`, i.e. `C:\Users\<you>\`), create a file named `.wslconfig` — it usually doesn't exist yet.
   - Add this to it:
     ```ini
     [wsl2]
     networkingMode=mirrored
     ```
   - From a normal (non-admin) PowerShell, run `wsl --shutdown`, then restart your distro and Docker.
5. **Allow the ports through Windows Firewall** — a separate requirement from step 4 and easy to miss. Even once mirrored networking or a `portproxy` rule gets a packet to the WSL2 interface, Windows Firewall still blocks unsolicited inbound traffic by default on every profile (`Get-NetFirewallProfile` typically shows `DefaultInboundAction: NotConfigured`, which resolves to *block*). Symptom if this is the missing piece: the connection just times out — no TLS error, no "connection refused" — both from another machine on the LAN *and* from the docker host itself when hitting its own real LAN IP (`https://192.168.x.x/...`) instead of `localhost`. Fix, from an **elevated** PowerShell (`Run as Administrator`) on the Windows host:
   ```powershell
   New-NetFirewallRule -DisplayName "SAPOT dev server (HTTPS 443)" -Direction Inbound -Protocol TCP -LocalPort 443 -Profile Private -Action Allow
   New-NetFirewallRule -DisplayName "SAPOT dev server (HTTP 80)"   -Direction Inbound -Protocol TCP -LocalPort 80  -Profile Private -Action Allow
   ```
   Match `-Profile` to your active network category — `Get-NetConnectionProfile` shows it (usually `Private` for a home/trusted network).

## Configure

```bash
cp server/.env.example server/.env
```

Optional — override the stack's host-side ports (default: `nginx` 443/80, `admin` 3000,
`gsm-fastapi` 8001) by copying the repo-root env file too:

```bash
cp .env.example .env
```

Only needed if you want to change a port (e.g. running a second stack concurrently — see
[Running from a git worktree](#running-from-a-git-worktree) below). Skip it and the defaults apply.

To also bring up the admin dashboard and SMS gateway, configure their env files too:

```bash
cp admin-frontend/sapot-admin/.env.example admin-frontend/sapot-admin/.env
cp GSM-module/GSM-fastapi/.env.example GSM-module/GSM-fastapi/.env
```

`gsm-fastapi`'s `GSM_SECRET` must match `server/.env`'s `GSM_SECRET` — they authenticate the
webhook calls between the two services (see [environment-config.md](../deployment/environment-config.md)).
The `gsm-fastapi` container passes through the GSM modem at `/dev/ttyACM0`, but only when
`docker-compose.gsm-hardware.yml` is explicitly merged in (Compose has no "optional device" syntax,
so this stays out of the base `docker-compose.yml`/`docker-compose.override.yml` — otherwise the
whole `docker compose up` would abort on any machine without the GSM modem attached, leaving `nginx`/
`admin` stuck in `Created`). On a machine with the GSM modem attached:

```bash
./docker/up.sh -f docker-compose.yml -f docker-compose.gsm-hardware.yml up --build -d
```

Without the GSM modem, just run the normal `./docker/up.sh up --build -d` below — `gsm-fastapi` still
starts, it just won't have serial access.

See [SECURITY.md](../../SECURITY.md) for why `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, and `SERVER_ED25519_SEED` are required at import time. `server/.env.example` ships a working value for each, so the copy above is enough for local dev.

## Run

```bash
./docker/up.sh up --build -d
```

(`docker/up.sh` wraps `docker compose`, auto-detecting this machine's LAN IP for the dev TLS cert's SAN — use it instead of calling `docker compose` directly. Windows: `docker/up.ps1`.)

This brings up every service in `docker-compose.yml`. Besides `db`/`redis`/`api`/`certgen`/`nginx`,
that includes:

- `admin`: the Next.js admin dashboard. Its `next.config.ts` sets `basePath: "/admin"`, so the
  dashboard lives at `http://localhost:3000/admin` (published port) or `https://localhost/admin`
  (through `nginx`), **not** at the bare `/`, which 404s.
- `tileserver`: offline map tiles. Not published to the host: `docker-compose.yml` only `expose`s
  port 8080 on the internal network, so reach it at `https://localhost/tiles/` through `nginx`.
- `gsm-fastapi`: the SMS gateway, `http://localhost:8001` (starts without the GSM modem; add
  `docker-compose.gsm-hardware.yml` per the [Configure](#configure) section above for real SMS)

`nginx` declares `depends_on` on `admin` and `tileserver` (both proxied by `nginx.docker.conf` as
static upstreams, which nginx resolves at config-load time and refuses to start without). Naming
`nginx` therefore always pulls those two in. `gsm-fastapi` is the only service you can leave out:

```bash
./docker/up.sh up --build -d db redis api certgen nginx
```

## Apply database migrations

**Required on a fresh `db-data` volume. The stack does not do this for you.** The schema is owned
by Alembic ([ADR 0007](../adr/0007-alembic-for-server-migrations.md)); the app no longer calls
`create_all()` at startup, and the `api` image's `CMD` is a bare gunicorn with no migration step.
Skip this and `api` starts fine but every request that touches the database fails on a missing
table.

```bash
docker compose exec api alembic upgrade head
```

Run it again after any pull that adds a migration. See [migrations.md](../database/migrations.md)
for the full workflow, and its [one-time cutover](../database/migrations.md#one-time-cutover-for-existing-databases)
section if you are pointing the stack at a database that predates Alembic.

## Verify

```bash
docker compose ps
```
Expect `db`/`redis` **healthy**, `certgen` exited (0), and `api`/`nginx`/`admin`/`tileserver`/`gsm-fastapi` running. Only `db` and `redis` declare healthchecks in the dev stack. `api`'s `/version` probe lives in `docker-compose.ci.yml` and is not loaded here, so `api` shows no health status and `nginx` waits only for its *process* to start (`condition: service_started`). A slow first boot can therefore still race `nginx` into serving 502s for a few seconds; the [Troubleshooting](#troubleshooting) entry below covers telling that apart from a real failure.

```bash
docker compose logs -f api
```
Look for Uvicorn's "Application startup complete" with no traceback.

```bash
curl -sk https://localhost/version
```
Expect a JSON version payload. A connection/TLS error means `nginx`/`certgen` isn't ready; a `502 Bad Gateway` means `nginx` is up but couldn't reach `api`. Check the `api` logs above, not `nginx`'s own logs, to find the actual cause.

## Troubleshooting

**`nginx` returns `502 Bad Gateway`.** This means `nginx` itself is fine — TLS terminated, the request was parsed — but its `proxy_pass` to `api:8000` (Docker's internal bridge network, unrelated to any LAN/cert IP) got nothing back. Always check `api` first, not `nginx`:
```bash
docker compose ps                    # is api running, exited, or restarting?
docker compose logs api --tail=50    # look for a traceback right before "Application startup failed"
```
- **`api` is running and the 502s stop on their own within a few seconds of `up -d`**: expected. The dev stack gives `api` no healthcheck, so `nginx` starts as soon as the `api` *process* does, which is before Uvicorn finishes importing the app. Just retry.
- **`api` is running and the 502s persist**: read the logs. An unset required env var (`DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, `SERVER_ED25519_SEED`, or `QA_API_TOKEN` when `ENVIRONMENT=development` or `staging`) raises at import time and the container exits before serving anything. An unrecognised `ENVIRONMENT` value also stops the app at import time.

**Requests reach `api` but fail on missing tables (`1146 Table ... doesn't exist`).** Migrations were never applied to this `db-data` volume. Run [Apply database migrations](#apply-database-migrations).

**Another machine on the LAN can't reach `https://<host-LAN-IP>/...` at all (times out, not a TLS or refused error).** Two independent requirements, both needed:
1. WSL2 networking mode — see step 4 under [Running under WSL](#running-under-wsl). Confirms the packet reaches the WSL2 network namespace at all.
2. Windows Firewall inbound rule — see step 5 under the same section. Even with (1) solved, Windows blocks unsolicited inbound by default; this is the one that's easy to miss because the WSL2-networking docs don't mention it. Diagnostic: if even the docker host itself can't reach its own real LAN IP (as opposed to `localhost`), that's this, not (1).

**`https://0.0.0.0/...` doesn't work.** Expected — `0.0.0.0` is a wildcard *bind* address (Docker publishes nginx's port on every host interface), not a real address a client can connect *to*. Use `https://localhost/...` from the host or `https://<host-LAN-IP>/...` from any machine on the LAN.

**Port `80`/`443` already allocated — `nginx` (and anything depending on it, like `admin`) never starts.** If you ran the old `server/docker-compose.yml` stack (from before it moved to the repo root) and never tore it down, it's still running under the Compose project name `server`, holding those ports:
```bash
docker ps -a --filter "name=server-"   # confirms the old stack is still up
docker compose -p server down          # stops and removes it
```
The new stack runs under a different project name (derived from the repo root directory), so Docker treats them as two independent stacks that happen to fight over the same host ports.

**`admin` (or any other service) stays stuck in `Created` and never actually starts.** `docker compose up` (no service names) starts every service in dependency order; if one fails partway, services later in the batch can be left created but never started. The most common cause used to be `gsm-fastapi`'s `/dev/ttyACM0` device passthrough failing on machines without the GSM modem — that's no longer in the base `docker-compose.yml` (see [Configure](#configure)), so this should only recur if you merged in `docker-compose.gsm-hardware.yml` without the GSM modem actually attached. Either way, bring up the specific services you need directly instead of relying on the full batch:
```bash
docker compose up -d db redis api certgen nginx   # pulls in admin + tileserver, skips gsm-fastapi
```

**`https://localhost/admin` works but `http://localhost:3000` returns 404.** Expected. The admin app sets `basePath: "/admin"` in `next.config.ts`, so its published port serves the dashboard at `http://localhost:3000/admin`, not at the root path.

**`nginx` logs `host not found in upstream "api"` even though `api` is running.** The `nginx` container was created against a stale image/config and never recreated (Compose reuses an existing container if it thinks nothing relevant changed). Force it:
```bash
docker compose up -d --force-recreate nginx admin
```

## Running from a git worktree

Running `docker/up.sh` (or plain `docker compose`) from inside a git worktree checkout works
correctly and is isolated from the main checkout's stack, with one thing to configure if you want
both running at once:

- **Isolation is automatic.** `docker/up.sh` `cd`s to its own script's directory before calling
  `docker compose`, so every relative path in `docker-compose.yml` — build contexts, the
  `./server/app` live-reload bind mount, `./docker/nginx.docker.conf`, etc. — resolves inside
  *that* worktree, not the main checkout. Compose also derives the project name from the checkout's
  directory name, so a worktree gets its own containers, network, and `db-data` volume automatically
  — no shared state with the main checkout's stack.
- **Host ports are not automatically isolated.** Two stacks (main checkout + a worktree, or two
  worktrees) both bind `443`/`80`/`3000`/`8001` on the host by default, so bringing up a
  second stack while the first is still running fails with "port is already allocated". If you want
  them running concurrently, give the worktree its own `.env` (root-level, copied from
  `.env.example`) with different port values, e.g.:
  ```dotenv
  NGINX_HTTPS_PORT=8443
  NGINX_HTTP_PORT=8080
  ADMIN_PORT=13000
  GSM_FASTAPI_PORT=18001
  ```
  (`.env.example` also carries `TILESERVER_PORT`, but `docker-compose.yml` no longer publishes
  `tileserver` to the host, so setting it has no effect.)
  If you only ever run one stack at a time — the more common workflow, matching how you'd run
  bare-metal dev servers — you can skip this and leave every worktree's ports at their defaults.
- **`gsm-fastapi` has no live bind mount** — its code is baked into the image at `docker compose
  build` time from that worktree's `./GSM-module/GSM-fastapi`. Editing GSM code in a worktree and
  running `up` without rebuilding will still run whatever was baked in last. Rebuild after pulling
  or editing GSM code there: `docker/up.sh up --build -d gsm-fastapi`.
- **The GSM modem device (`/dev/ttyACM0`) is physical hardware** — it can't be attached to two
  containers at once, so don't run `gsm-fastapi` from more than one stack simultaneously regardless
  of port configuration.

## Next

- [Mobile app setup](mobile-app-setup.md) to connect a client.
- [Admin frontend setup](admin-frontend-setup.md) to create the first administrator and sign in to the dashboard the `admin` service is already serving.
- [environment-config.md](../deployment/environment-config.md) for the full server environment variable list.
