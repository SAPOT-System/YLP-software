# Getting Started: Overview

SAPOT is made of four independently-runnable components. Set up only the ones you need for the task at hand.

| Component | Path | Language / Stack | Purpose |
|---|---|---|---|
| Server | `server/` | Python / FastAPI | REST API, WebSocket signalling relay, GPS streaming, MariaDB storage |
| Mobile app | `mobile-app/sapot-mobile-app/` | React Native / Expo | The SAPOT client — P2P LAN messenger + server-relayed fallback |
| GSM module | `GSM-module/GSM-fastapi/` | Python / FastAPI | SMS gateway bridging the server to a serial-attached GSM modem |
| Admin frontend | `admin-frontend/sapot-admin/` | Next.js | Admin dashboard (announcements, user/router management) |

## Fastest path

For a single "clone → run the whole stack" walkthrough (server + mobile app, with optional GSM and admin frontend steps), see [quickstart.md](quickstart.md). The per-component guides below go into more depth on each piece individually.

## Typical setup order

1. [Docker setup (full stack)](docker-setup.md) — server needed by every other component; also brings up the admin dashboard, tileserver, and SMS gateway. Prefer running the API directly without Docker? See [server-setup.md](server-setup.md) (bare-metal).
2. [Mobile app setup](mobile-app-setup.md) — the primary client; requires the server running and reachable on the same LAN for local dev.
3. [GSM module setup](gsm-module-setup.md) — only needed if testing SMS fallback.
4. [Admin frontend setup](admin-frontend-setup.md) — only needed for admin dashboard work.

If something doesn't work, see [../TROUBLESHOOTING.md](../TROUBLESHOOTING.md).

## Related documentation

- [`docs/architecture/`](../architecture/) — system-wide architecture
- [`docs/deployment/environment-config.md`](../deployment/environment-config.md) — full environment variable reference for all components
- [`mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md`](../../mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md) — mobile app internals
- [`mobile-app/sapot-mobile-app/docs/ONBOARDING.md`](../../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) — mobile app onboarding doc
