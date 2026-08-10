# Admin Frontend Deployment

The SAPOT admin panel (`admin-frontend/sapot-admin/`) is a Next.js 16 application providing user management, ban management, announcements, activity logs, and router telemetry dashboards.

---

## Development

```bash
cd admin-frontend/sapot-admin/
pnpm install
pnpm dev
```

The dev server starts on `http://localhost:3000`. Allowed dev origins (configured in `next.config.ts`): `192.168.0.99`, `192.168.0.100`.

### Docker (dev/test alternative)

The root `docker-compose.yml` (see [docker-setup.md](../getting-started/docker-setup.md))
includes an `admin` service running `pnpm dev` with the source bind-mounted for hot reload, alongside
the rest of the stack. It mounts the backend's public dev CA (read-only), so `NODE_EXTRA_CA_CERTS`
trusts renewed backend leaf certificates without receiving the backend private key. `API_DOMAIN` is set to the in-network `nginx` service name (server-side
only); `NEXT_PUBLIC_*` variables still need a host-reachable value (LAN IP/`localhost`) in this service's
own `.env`, since they run in the browser, not the container.

---

## Production build

```bash
pnpm run build
pnpm run start
```

`pnpm run start` runs `next start`, which serves the built app on port 3000 by default. `pnpm` is this
project's declared package manager (`admin-frontend/sapot-admin/AGENTS.md`); `pnpm-lock.yaml` is the
lockfile of record — the stale `package-lock.json` from an earlier npm setup has been removed.

---

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `API_DOMAIN` | SAPOT server base URL, read server-side only — **not** `NEXT_PUBLIC_API_URL` (a name that doesn't exist anywhere in this codebase and was documented here in error) | Yes |
| `NEXT_PUBLIC_MAP_STYLE` | MapLibre tile style URL | Yes |
| `NEXT_PUBLIC_WEBSOCKET_DOMAIN` | WebSocket server domain | Yes |
| `NODE_ENV` | Toggles the `secure` flag on auth cookies | Set by the Node runtime |

See [environment-config.md](environment-config.md#admin-frontend-admin-frontendsapot-admin) for the canonical, fuller description of each variable. Set these in a `.env.local` file (not committed) or via the host service manager.

---

## Deployment with systemd

Create `/etc/systemd/system/sapot-admin.service`:

```ini
[Unit]
Description=SAPOT Admin Frontend
After=network.target

[Service]
WorkingDirectory=/home/sapot/YLP-software/admin-frontend/sapot-admin
ExecStart=/usr/bin/pnpm run start
Restart=always
User=sapot
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable sapot-admin
sudo systemctl start sapot-admin
```

---

## Nginx proxy (optional)

To serve the admin panel through Nginx, proxy to port 3000:

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
}
```

---

## Notes

- `next.config.ts` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`. Fix type and lint errors before disabling these for production hardening.
- The admin panel communicates directly with the SAPOT FastAPI server. It requires admin credentials (POST `/api/admin/login`).

---

> **TODO (human input required):** Document the full list of required environment variables and the admin account bootstrap procedure.
