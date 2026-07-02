# Component Map

## Runtime topology

```
Internet (optional — not required for core operation)
     |
MikroTik Router (LAN gateway + captive portal + tileserver host)
     |
     +--- Wi-Fi / Ethernet LAN
              |
    +---------+----------+
    |                    |
Android devices     Server host (Linux, systemd)
(mobile-app)             |
    |                    +-- [nginx :443] (TLS reverse proxy)
    |                    |        |
    |                    |        +-- [gunicorn :8000] (SAPOT FastAPI)
    |                    |                  |
    |                    |                  +-- [MariaDB :3306]
    |                    |                  |
    |                    |                  +-- [Redis :6379] (WS pub-sub)
    |                    |
    |                    +-- [GSM-API] (FastAPI + pyserial -> Arduino/modem)
    |
    +--- Direct P2P (WebRTC media/data, LAN TCP+TLS)
         to other Android devices on the same LAN
```

```mermaid
flowchart TB
    internet(["Internet\n(optional)"])
    router["MikroTik Router\n(LAN gateway, captive portal, tileserver host)"]

    subgraph host["Server host (Linux, systemd)"]
        nginx["nginx :443\n(TLS reverse proxy)"]
        api["gunicorn :8000\n(SAPOT FastAPI)"]
        db[("MariaDB :3306")]
        redis[("Redis :6379\nWS pub-sub")]
        gsmapi["GSM-API\n(FastAPI + pyserial)"]
    end

    arduino["Arduino / serial modem"]
    phoneA["Android device A\n(mobile-app)"]
    phoneB["Android device B\n(mobile-app)"]

    internet -.optional uplink.-> router
    router --- host
    nginx --> api
    api --- db
    api --- redis
    api --- gsmapi
    gsmapi --> arduino
    router === phoneA
    router === phoneB
    phoneA <-."Direct P2P\n(WebRTC media/data, LAN TCP+TLS)".-> phoneB
```

For the security trust boundaries overlaid on this same topology (which zones are trusted vs. semi-trusted), see [threat-model.md](threat-model.md#trust-boundaries).

---

## Services and ports

| Service | Process | Listens | Proxied by |
|---|---|---|---|
| SAPOT FastAPI server | `gunicorn` + `uvicorn` workers | `127.0.0.1:8000` | Nginx `:443` |
| Nginx reverse proxy | `nginx` | `0.0.0.0:443` (TLS), `:80` (redirect) | — |
| MariaDB | `mysqld` | `127.0.0.1:3306` | — (server-internal) |
| Redis | `redis-server` | `127.0.0.1:6379` | — (server-internal) |
| GSM module API | `gunicorn` / `uvicorn` | Verify from GSM-module config | — |
| Tileserver | — | Verify from tileserver config | Nginx or direct |
| Admin frontend | `next start` | Verify from admin deployment | — |

---

## Nginx routing

| Path | Upstream | Notes |
|---|---|---|
| `/ws/` | `http://127.0.0.1:8000` | WebSocket — no proxy read timeout (86400 s) |
| `/static/` | Filesystem | Served directly by Nginx; 30-day cache |
| `/` (all other) | `http://127.0.0.1:8000` | Standard proxy; 135 s read timeout |

HTTP (port 80) redirects to HTTPS with 301.

---

## systemd services (known)

| Unit | Component |
|---|---|
| `server-main-api.service` | SAPOT FastAPI server |
| `server-GSM-api.service` | GSM module API |
| `tileserver.service` | Offline tile server |

> **Note:** Verify exact unit names from `deployment-scripts/` or the server directory.

---

## Mobile app connectivity

| Protocol | Target | Purpose |
|---|---|---|
| HTTPS | Server (via Nginx) | REST API calls |
| WSS | Server `/ws/` | Signalling, presence, message relay |
| WSS | Server `/gps/ws/` | GPS streaming |
| WebRTC (P2P) | Other devices | Voice/video calls, data channel |
| LAN TCP + TLS | Other devices | Direct peer messaging |
| mDNS / Zeroconf | LAN broadcast | Peer discovery |

See [data-flow.md](data-flow.md) for detailed message and call flows.
