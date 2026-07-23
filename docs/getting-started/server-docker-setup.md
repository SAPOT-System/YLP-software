# Server Setup (Docker)

Alternative to [server-setup.md](server-setup.md) (bare-metal) — runs the full stack (`db`, `redis`, `api`, `certgen`, `nginx`) via `server/docker-compose.yml`.

## Prerequisites

- Docker + Docker Compose v2
- The Firebase Admin service-account JSON credential, sent to you directly by whoever manages `server/secrets/` — ask for it if you don't have it yet.

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
cd server
cp .env.docker.example .env
```

Place the Firebase Admin service-account JSON you received onto this machine, at a path your user can read (e.g. your home directory in the WSL distro — not the Windows filesystem, since the container reads it through a Linux bind mount):

```bash
# copy/move the file you were sent to, e.g.:
mv /path/to/received/firebase-admin.json ~/firebase-admin.json
chmod 600 ~/firebase-admin.json
```

Then point `.env` at it.

Add to `.env` (not yet in `.env.docker.example` — add manually until that's fixed):

```dotenv
FIREBASE_ADMIN_CREDENTIALS_PATH=/home/app/server/certs/firebase-admin.json
FIREBASE_ADMIN_CREDENTIALS_HOST_PATH=/home/<you>/firebase-admin.json
ADMIN_WEB_URL=https://<ip>:3000 # For admin website
```

See [SECURITY.md](../../SECURITY.md) for why these (and `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`) are required at import time.

**Save the credential file before running `up.sh`.** `docker-compose.override.yml` bind-mounts `FIREBASE_ADMIN_CREDENTIALS_HOST_PATH` into the container. If that host path doesn't exist yet when you start the stack (forgot to save the file above, or `FIREBASE_ADMIN_CREDENTIALS_HOST_PATH` doesn't match where you actually saved it), Docker silently creates an empty *directory* at that path instead of erroring. `api` then crash-loops with a buried `IsADirectoryError` from the Firebase SDK, and `nginx` returns `502 Bad Gateway` for every request with no indication why. See [Troubleshooting](#troubleshooting) below if you hit this.

## Run

```bash
./docker/up.sh up --build -d
```

(`docker/up.sh` wraps `docker compose`, auto-detecting this machine's LAN IP for the dev TLS cert's SAN — use it instead of calling `docker compose` directly. Windows: `docker/up.ps1`.)

## Verify

```bash
docker compose ps
```
Expect `db`/`redis`/`api` **healthy**, `certgen` exited (0), `nginx` running. `nginx`'s `depends_on` waits for `api`'s own healthcheck (a request to `/version` inside the container), not just the process launching — so a slow first boot (image build, Firebase init, table creation) no longer races `nginx` into serving 502s before `api` is actually ready. If `api` sits at `starting`/`unhealthy` instead of turning `healthy`, go straight to its logs below rather than assuming it's a networking issue.

```bash
docker compose logs -f api
```
Look for Uvicorn's "Application startup complete" with no traceback.

```bash
curl -sk https://localhost/version
```
Expect a JSON version payload. A connection/TLS error means `nginx`/`certgen` isn't ready; a `502 Bad Gateway` means `nginx` is up but couldn't reach `api` — check `docker compose ps`'s health column and the `api` logs above, not `nginx`'s own logs, to find the actual cause.

## Troubleshooting

**`nginx` returns `502 Bad Gateway`.** This means `nginx` itself is fine — TLS terminated, the request was parsed — but its `proxy_pass` to `api:8000` (Docker's internal bridge network, unrelated to any LAN/cert IP) got nothing back. Always check `api` first, not `nginx`:
```bash
docker compose ps                    # is api "healthy", "unhealthy", or restarting?
docker compose logs api --tail=50    # look for a traceback right before "Application startup failed"
```
- `IsADirectoryError: ... firebase-admin.json` — the Firebase credential bind-mount gotcha above. Fix:
  ```bash
  rmdir ~/firebase-admin.json   # remove the phantom empty dir Docker auto-created; match your actual FIREBASE_ADMIN_CREDENTIALS_HOST_PATH
  # re-save the Firebase Admin JSON you were sent to that same path
  docker compose up -d --force-recreate api
  ```
- `api` is `healthy` and `nginx` still 502s intermittently right after `up --build -d` — retry once; this was a startup race in older versions of `docker-compose.yml` (`nginx` didn't wait for `api`'s healthcheck) and shouldn't recur, but a very slow first build can still occasionally outrun the `start_period`.

**Another machine on the LAN can't reach `https://<host-LAN-IP>/...` at all (times out, not a TLS or refused error).** Two independent requirements, both needed:
1. WSL2 networking mode — see step 4 under [Running under WSL](#running-under-wsl). Confirms the packet reaches the WSL2 network namespace at all.
2. Windows Firewall inbound rule — see step 5 under the same section. Even with (1) solved, Windows blocks unsolicited inbound by default; this is the one that's easy to miss because the WSL2-networking docs don't mention it. Diagnostic: if even the docker host itself can't reach its own real LAN IP (as opposed to `localhost`), that's this, not (1).

**`https://0.0.0.0/...` doesn't work.** Expected — `0.0.0.0` is a wildcard *bind* address (Docker publishes nginx's port on every host interface), not a real address a client can connect *to*. Use `https://localhost/...` from the host or `https://<host-LAN-IP>/...` from any machine on the LAN.

## Next

- [Mobile app setup](mobile-app-setup.md) to connect a client.
- [environment-config.md](../deployment/environment-config.md) for the full server environment variable list.
