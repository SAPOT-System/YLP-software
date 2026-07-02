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

---

## Production build

```bash
pnpm build
pnpm start
```

`pnpm start` runs `next start`, which serves the built app on port 3000 by default.

---

## Environment variables

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | SAPOT server base URL (e.g. `https://192.168.0.100`) | Yes |

Set environment variables in a `.env.local` file (not committed) or via the host service manager.

---

## Deployment with systemd

Create `/etc/systemd/system/sapot-admin.service`:

```ini
[Unit]
Description=SAPOT Admin Frontend
After=network.target

[Service]
WorkingDirectory=/home/sapot/YLP-software/admin-frontend/sapot-admin
ExecStart=/usr/bin/pnpm start
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
- The admin panel communicates directly with the SAPOT FastAPI server. It requires admin credentials (POST `/admin/login`).

---

> **TODO (human input required):** Document the full list of required environment variables and the admin account bootstrap procedure.
