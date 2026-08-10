# Getting Started: Overview

SAPOT is built from independently-runnable components, each with its own toolchain and no shared build. Set up only the ones you need for the task at hand.

Four have a dedicated setup guide here:

| Component | Path | Language / Stack | Purpose |
|---|---|---|---|
| Server | `server/` | Python / FastAPI | REST API, WebSocket signalling relay, GPS streaming, MariaDB storage |
| Mobile app | `mobile-app/sapot-mobile-app/` | React Native / Expo | The SAPOT client — P2P LAN messenger + server-relayed fallback |
| GSM module | `GSM-module/GSM-fastapi/` | Python / FastAPI | SMS gateway bridging the server to a serial-attached GSM modem |
| Admin frontend | `admin-frontend/sapot-admin/` | Next.js | Admin dashboard (announcements, user/router management) |

Two more ship with the system but need no per-developer setup:

| Component | Path | What to know |
|---|---|---|
| Tileserver | `tileserver/` | Deploy scripts only, no source. The [Docker stack](docker-setup.md) runs it as a service behind Nginx at `/tiles/`; you only supply the gitignored `.mbtiles` data file. |
| Captive portal | `captive-portal/` | Static HTML/CSS/JS login pages served by the RouterOS hotspot, not by any component above. Deployed to the router, not run locally. |

## Fastest path

For a single "clone → run the whole stack" walkthrough (server + mobile app, with optional GSM and admin frontend steps), see [quickstart.md](quickstart.md). The per-component guides below go into more depth on each piece individually.

## Typical setup order

1. [Docker setup (full stack)](docker-setup.md): server needed by every other component; also brings up the admin dashboard, tileserver, and SMS gateway. Prefer running the API directly without Docker? See [server-setup.md](server-setup.md) (bare-metal). Either path needs a separate `alembic upgrade head` before the API can serve anything: the schema is Alembic-owned ([ADR 0007](../adr/0007-alembic-for-server-migrations.md)) and no startup path creates it.
2. [Mobile app setup](mobile-app-setup.md) — the primary client; requires the server running and reachable on the same LAN for local dev.
3. [GSM module setup](gsm-module-setup.md): only needed if testing SMS fallback; the Docker stack already runs this service, so follow it only for a modem on a non-Docker host.
4. [Admin frontend setup](admin-frontend-setup.md): the Docker stack already serves the dashboard, but a fresh database has no administrator; this guide covers creating the first one.

If something doesn't work, see [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

## Related documentation

- [`docs/architecture/`](../architecture/) — system-wide architecture
- [`docs/deployment/environment-config.md`](../deployment/environment-config.md) — full environment variable reference for all components
- [`mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md`](../../mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md) — mobile app internals
- [`mobile-app/sapot-mobile-app/docs/ONBOARDING.md`](../../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) — mobile app onboarding doc
