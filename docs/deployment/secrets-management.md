# Secrets Management

## Current state

SAPOT has **no formal secrets management system**. Secrets are handled through environment variables, loaded via `load_dotenv()` in `server/app/main.py`.

See the repo-root `SECURITY.md` for the canonical list of resolved and outstanding security gaps — do not duplicate that table here.

---

## Secrets storage (LAN deployment)

Without a cloud secret manager, store secrets in restricted env files:

1. Place secrets in `/etc/sapot/server.env`, `/etc/sapot/gsm.env`, etc.
2. Restrict access: `chmod 600` and `chown sapot:sapot`.
3. Reference via `EnvironmentFile=` in systemd units (see [environment-config.md](environment-config.md)).
4. Never commit `.env` files or files containing real credentials to git.
5. Rotate all passwords and the JWT secret before going live.

---

## TLS certificate

The server's TLS certificate lives at `/home/sapot/certs/server.crt` and `server.key` (referenced in `nginx.conf`), issued by the offline CA on the CA USB stick ([runbooks.md](runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf)). The mobile app pins the *CA*, not the leaf, so the leaf can be reissued without rebuilding the app (see [mobile-eas.md](mobile-eas.md)).

Rotate the certificate before expiry and rebuild the mobile APK to distribute the updated pinned cert.
