# Security Policy

This is the canonical source of truth for SAPOT's known security-relevant configuration and history. Other docs link here instead of repeating this table.

---

## Resolved issues (fixed in code)

| Issue | Location | Fix |
|---|---|---|
| Hardcoded MariaDB credentials | `server/app/db_operations/auth.py` (`SQLALCHEMY_DATABASE_URL`) | Now required via `DATABASE_URL` env var; the app raises `RuntimeError` at import time if unset. **Rotate the previously-hardcoded DB password before deploying this fix.** |
| Hardcoded GSM MariaDB credentials | `GSM-module/GSM-fastapi/config.py` (`db_path`) | Now required via `DB_PATH`; the GSM service raises `RuntimeError` at import time if unset. **Rotate the previously-hardcoded DB password before deploying this fix.** |
| Hardcoded JWT secret fallback | `server/app/db_operations/token.py` (`SECRET_KEY`) | The default value has been removed; `JWT_SECRET_KEY` is now required, and the app raises `RuntimeError` at import time if unset. **Rotate to a newly generated secret** (`openssl rand -hex 32`) — the old hardcoded value must be considered compromised since it was committed to source. |
| CORS wildcard + credentials | `server/app/main.py` | `allow_origins=["*"]` replaced with an explicit allowlist read from `CORS_ALLOWED_ORIGINS` (comma-separated). The app raises `RuntimeError` at import time if unset. |
| Testing router in production | `server/app/main.py`, `server/app/api/testing.py` | The router is imported and mounted only in `development` or `staging`. A router-wide dependency also returns 404 outside those environments if the router is mis-mounted. Every state-changing route requires the `X-QA-Token` shared secret. A production-process regression test exercises every testing path. |

## Required environment variables (new)

Set these in the server's env file (see [environment-config.md](docs/deployment/environment-config.md)) before starting the server — it will fail fast at import time otherwise:

```dotenv
DATABASE_URL=mysql+pymysql://<user>:<rotated-password>@127.0.0.1:3306/sapot_db
JWT_SECRET_KEY=<generate with: openssl rand -hex 32>
CORS_ALLOWED_ORIGINS=http://192.168.0.100:3000
GSM_SECRET=<shared secret with the GSM module>
```

Set this in `/etc/sapot/gsm.env` before starting the GSM service:

```dotenv
DB_PATH=mysql+pymysql://<user>:<rotated-password>@127.0.0.1:3306/sapot_db
```
QA-enabled environments also require `QA_API_TOKEN`. Generate a strong random value and send it
as `X-QA-Token` for state-changing `/testing/*` requests. Production does not load this secret.

## Reporting a vulnerability

This is a LAN-deployed application without a public bug bounty program. Report suspected vulnerabilities directly to the maintainer rather than opening a public GitHub issue.

## Other known gaps (not yet resolved)

| Gap | Location | Risk |
|---|---|---|
| Optional (not enforced) server-side `PeerKey` signing | `SERVER_ED25519_SEED` env var | If unset, a compromised server can MITM new conversations by substituting public keys. See [docs/architecture/threat-model.md](docs/architecture/threat-model.md#e2e-encryption-design-risks). |
| No remote session/device revocation UI | Mobile app | A stolen, already-unlocked device has an unbounded access window until an admin manually suspends the account. See [docs/architecture/threat-model.md](docs/architecture/threat-model.md#device-theft). |

---

Referenced from: [docs/architecture/security-architecture.md](docs/architecture/security-architecture.md), [docs/deployment/secrets-management.md](docs/deployment/secrets-management.md), [docs/deployment/environment-config.md](docs/deployment/environment-config.md), [docs/features/authentication/design.md](docs/features/authentication/design.md).
