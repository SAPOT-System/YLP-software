# Server Setup (Docker)

Alternative to [server-setup.md](server-setup.md) (bare-metal) — runs the full stack (`db`, `redis`, `api`, `certgen`, `nginx`) via `server/docker-compose.yml`.

## Prerequisites

- Docker + Docker Compose v2
- Your own `age` keypair added to `server/secrets/age-recipients.txt`, so you can decrypt the shared Firebase Admin credential (ask whoever manages `server/secrets/` to add your public key if you don't have access yet)

If you don't have an `age` keypair yet, generate one:

```bash
mkdir -p ~/.age
age-keygen -o ~/.age/keys.txt
```

This prints your public key (`Public key: age1...`) and saves the private key to `~/.age/keys.txt` — keep that file secret, never commit or share it. Message the developer who manages `server/secrets/` with your public key and ask them to add it to `server/secrets/age-recipients.txt` before continuing.

## Running under WSL

Everything below works from a WSL2 distro's bash shell as-is — use `docker/up.sh` (not `up.ps1`, which is for plain PowerShell). Set up in this order:

1. **Install Docker Engine inside the distro** — use the [official Docker Engine install steps](https://docs.docker.com/engine/install/) for your distro (e.g. Ubuntu), not Docker Desktop. A fresh WSL install has no `docker` command otherwise.
2. **Start the Docker daemon** — `sudo service docker start` (or enable it via systemd if your distro has it enabled: `sudo systemctl enable --now docker`).
3. **Confirm `age` and `python3` are installed** in the distro — the steps above assume both are already present.
4. **Before connecting a mobile client, check WSL2's networking mode** — `docker/up.sh` auto-detects a LAN IP for the dev TLS cert's SAN, but under WSL2's default NAT networking it detects the WSL2 virtual adapter's IP, not the Windows host's real LAN IP. `curl https://localhost/version` from WSL or Windows still works either way, but a phone running the [mobile app](mobile-app-setup.md) on the same network won't be able to reach the server at that IP unless you do one of:
   - Enable WSL2 **mirrored networking** (Windows 11): add `networkingMode=mirrored` under `[wsl2]` in `%UserProfile%\.wslconfig`, then `wsl --shutdown` and restart.
   - Set `CERT_SAN` manually to the Windows host's real LAN IP and add a `netsh interface portproxy` rule to forward it into WSL2.

## Configure

```bash
cd server
cp .env.docker.example .env
```

Decrypt the Firebase Admin service-account credential and point `.env` at your local copy:

```bash
age -d -i ~/.age/keys.txt -o ~/firebase-admin.json secrets/firebase-admin.json.age
```

Add to `.env` (not yet in `.env.docker.example` — add manually until that's fixed):

```dotenv
FIREBASE_ADMIN_CREDENTIALS_PATH=/home/app/server/certs/firebase-admin.json
FIREBASE_ADMIN_CREDENTIALS_HOST_PATH=/home/<you>/firebase-admin.json
ADMIN_WEB_URL=https://<ip>:3000 # For admin website
```

See [SECURITY.md](../../SECURITY.md) for why these (and `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`) are required at import time.

## Run

```bash
./docker/up.sh up --build -d
```

(`docker/up.sh` wraps `docker compose`, auto-detecting this machine's LAN IP for the dev TLS cert's SAN — use it instead of calling `docker compose` directly. Windows: `docker/up.ps1`.)

## Verify

```bash
docker compose ps
```
Expect `db`/`redis` healthy, `certgen` exited (0), `api`/`nginx` running.

```bash
docker compose logs -f api
```
Look for Uvicorn's "Application startup complete" with no traceback.

```bash
curl -sk https://localhost/version
```
Expect a JSON version payload. A connection/TLS error means `nginx`/`certgen` isn't ready; an error from this call specifically means check the `api` logs above.

## Next

- [Mobile app setup](mobile-app-setup.md) to connect a client.
- [environment-config.md](../deployment/environment-config.md) for the full server environment variable list.
