# Admin Frontend Setup

Source: `admin-frontend/sapot-admin/package.json`.

## Prerequisites

- Node.js and [pnpm](https://pnpm.io/) (this project's declared package manager — see `admin-frontend/sapot-admin/AGENTS.md`)

## Install and run

```bash
cd admin-frontend/sapot-admin
pnpm install
pnpm dev
```

This runs `NODE_EXTRA_CA_CERTS=$(pwd)/certs/server_ca.pem next dev` — the extra CA cert env var lets the dev server trust renewed SAPOT server TLS certificates (place the CA at `admin-frontend/sapot-admin/certs/server_ca.pem`).

Open [http://localhost:3000](http://localhost:3000).

## Configure

Set the SAPOT server base URL in `.env.local` (not committed). The variable is `API_DOMAIN` — **not** `NEXT_PUBLIC_API_URL` (that name doesn't exist anywhere in the codebase; `API_DOMAIN` is read server-side only, so it never reaches the client bundle):

```dotenv
API_DOMAIN=https://<sapot-server-host>
NEXT_PUBLIC_MAP_STYLE=https://<sapot-server-host>/tiles/styles/basic-preview/style.json
NEXT_PUBLIC_WEBSOCKET_DOMAIN=<sapot-server-host>
```

`NEXT_PUBLIC_MAP_STYLE` and the TileServer deployment's `TILESERVER_PUBLIC_URL`
must use the same public HTTPS host. The map must never point browsers at
TileServer GL's private port 8080.

See [environment-config.md](../deployment/environment-config.md#admin-frontend-admin-frontendsapot-admin) for the full reference.

## Other commands

| Command | Description |
|---|---|
| `pnpm run build` | Production build |
| `pnpm run start` | Serve production build |
| `pnpm run lint` | ESLint |

## Next

- [environment-config.md](../deployment/environment-config.md) for how `API_DOMAIN` relates to the other components' env vars.
