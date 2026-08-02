# Deployment Overview

SAPOT is a multi-component system deployed as independent services on a LAN.

---

## Components and deployment units

Each component runs as its own OS process on the same host (or split across hosts on the same LAN), with systemd supervising the long-running services.

| Component | Process | Managed by |
|---|---|---|
| FastAPI server | Gunicorn + uvicorn workers | systemd `server-main-api.service` |
| Nginx reverse proxy | nginx | systemd |
| MariaDB | mysqld | systemd |
| Redis | redis-server | systemd |
| Admin frontend | `next start` | systemd or manual |
| GSM module API | Gunicorn + uvicorn | systemd `server-GSM-api.service` |
| Tileserver | tileserver binary | systemd `tileserver.service` |
| MikroTik router | RouterOS (vendor) | RouterOS web UI |

---

## Deployment prerequisites

Install these on the host before starting any component; the Nix flake per component can substitute for the manual Python/Node setup.

- Linux host (tested Debian/Ubuntu)
- Nix package manager (optional — `flake.nix` per component)
- Python 3.11+ with venv
- Node.js + pnpm (admin frontend)
- MariaDB server
- Redis server
- Nginx
- TLS certificate at `/home/sapot/certs/server.crt` and `server.key`

---

## Network requirements

SAPOT is LAN-first (see [ADR 0005](../adr/0005-lan-first-design.md)) — the server must be reachable at a stable address on the same subnet as mobile devices.

- Static IP or DHCP reservation for the server on the LAN
- MikroTik router for captive portal (optional)
- Mobile devices on the same LAN subnet

---

## Deployment order

Later steps depend on earlier ones being up — start data stores before the API, and the API before anything that proxies or calls it.

1. Start MariaDB and Redis
2. Start SAPOT FastAPI server (creates DB tables on first run)
3. Start Nginx (proxy to `:8000`)
4. Start GSM module API (if hardware connected)
5. Start tileserver
6. Build and serve admin frontend

---

## Detailed guides

- [server.md](server.md)
- [mobile-eas.md](mobile-eas.md)
- [admin-frontend.md](admin-frontend.md)
- [gsm-module.md](gsm-module.md)
- [tileserver.md](tileserver.md)
- [environment-config.md](environment-config.md)
- [secrets-management.md](secrets-management.md)
- [monitoring-logging.md](monitoring-logging.md)
- [runbooks.md](runbooks.md) — backup/restore, manual DDL application, TLS rotation, rollback, disaster recovery
- [incident-response.md](incident-response.md) — severity levels, roles, and communication process during a live incident
- [maintenance.md](maintenance.md) — recurring backup/cert/log/dependency upkeep schedule
