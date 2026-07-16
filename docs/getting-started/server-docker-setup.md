# Server Setup (Docker)

Alternative to [server-setup.md](server-setup.md) (bare-metal) — runs the full stack (`db`, `redis`, `api`, `certgen`, `nginx`) via `server/docker-compose.yml`.

## Prerequisites

- Docker + Docker Compose v2
- Your own `age` keypair added to `server/secrets/age-recipients.txt`, so you can decrypt the shared Firebase Admin credential (ask whoever manages `server/secrets/` to add your public key if you don't have access yet)

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
