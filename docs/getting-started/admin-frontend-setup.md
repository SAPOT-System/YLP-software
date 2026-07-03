# Admin Frontend Setup

Source: `admin-frontend/sapot-admin/package.json`.

## Prerequisites

- Node.js and pnpm — the lockfile of record is `pnpm-lock.yaml`; ignore the stale `package-lock.json`.

## Install and run

```bash
cd admin-frontend/sapot-admin
pnpm install
pnpm run dev
```

This runs `NODE_EXTRA_CA_CERTS=$(pwd)/certs/server.crt next dev` — the extra CA cert env var lets the dev server trust the SAPOT server's TLS certificate (place your dev cert at `admin-frontend/sapot-admin/certs/server.crt`).

Open [http://localhost:3000](http://localhost:3000).

## Configure

Set the SAPOT server base URL in `.env.local` (not committed). The variable is `API_DOMAIN` — **not** `NEXT_PUBLIC_API_URL` (that name doesn't exist anywhere in the codebase; `API_DOMAIN` is read server-side only, so it never reaches the client bundle):

```dotenv
API_DOMAIN=https://<sapot-server-host>
NEXT_PUBLIC_MAP_STYLE=<maplibre tile style URL>
NEXT_PUBLIC_WEBSOCKET_DOMAIN=<sapot-server-host>
```

See [environment-config.md](../deployment/environment-config.md#admin-frontend-admin-frontendsapot-admin) for the full reference.

## Other commands

| Command | Description |
|---|---|
| `pnpm run build` | Production build |
| `pnpm run start` | Serve production build |
| `pnpm run lint` | ESLint |

## Next

- [environment-config.md](../deployment/environment-config.md) for how `NEXT_PUBLIC_API_URL` relates to the other components' env vars.
