# Admin Frontend Setup

The Next.js admin dashboard (announcements, user/router management, live GPS map). It talks to the
SAPOT server over HTTPS, so a running server ([docker-setup.md](docker-setup.md) or
[server-setup.md](server-setup.md)) is a prerequisite.

Already running the [Docker stack](docker-setup.md)? It builds and serves this app as the `admin`
service. Skip to [Create the first administrator](#create-the-first-administrator).

## Prerequisites

- Node.js and [pnpm](https://pnpm.io/) (pinned by `package.json`'s `packageManager` field, currently `pnpm@10.34.1`; Corepack fetches the exact version automatically if enabled)

## Configure

```bash
cd admin-frontend/sapot-admin
cp .env.example .env.local
```

| Variable | Purpose |
|---|---|
| `API_DOMAIN` | SAPOT server base URL. Read **server-side only** (route handlers, server actions), so it is deliberately not `NEXT_PUBLIC_`-prefixed and never reaches the client bundle. |
| `NEXT_PUBLIC_MAP_STYLE` | MapLibre style URL. With the Docker stack, the tileserver is only reachable through Nginx: `https://<server-host>/tiles/styles/basic-preview/style.json`. |
| `NEXT_PUBLIC_WEBSOCKET_DOMAIN` | WebSocket origin, e.g. `wss://<server-host>`. |
| `DEV_ORIGINS` | Comma-separated LAN IPs/hostnames allowed to reach the Next dev server (`next.config.ts` → `allowedDevOrigins`). Set it to your own machine's LAN IP to silence the cross-origin dev warning. |
| `NODE_EXTRA_CA_CERTS` | Path to the CA that signed the server's TLS certificate, consumed by Node's own TLS stack rather than by app code. `pnpm dev` already sets it to `certs/server_ca.pem`. |

There is no `NEXT_PUBLIC_API_URL` in this codebase. `API_DOMAIN` is the only server base URL.

See [environment-config.md](../deployment/environment-config.md#admin-frontend-admin-frontendsapot-admin) for the full reference.

### TLS trust

`certs/server_ca.pem` is committed, and it is the CA the Docker stack's `certgen` issues from, so a
default local setup needs no extra work. Replace that file if your server terminates TLS with a
certificate from a different CA, otherwise every server-side fetch fails TLS verification.

## Install and run

```bash
pnpm install
pnpm dev
```

Open **[http://localhost:3000/admin](http://localhost:3000/admin)**. The `/admin` prefix is required:
`next.config.ts` sets `basePath: "/admin"`, so the bare root path 404s. Through the Docker stack's
Nginx the same app is at `https://<server-host>/admin`.

`pnpm dev` expands to `NODE_EXTRA_CA_CERTS=$(pwd)/certs/server_ca.pem next dev`.

## Create the first administrator

A fresh database has no admin account, and the dashboard has no self-service signup. Create one with
the bootstrap script, which reads its JSON payload from **stdin only** so the password never lands in
shell history or a process listing. Against the Docker stack:

```bash
echo '{"username":"admin","first_name":"Ada","last_name":"Lovelace",
       "phone_number":"+639170000000","email":null,
       "password":"StrongPass123","terms_accepted":false}' \
  | docker compose exec -T api python -m app.scripts.bootstrap_admin
```

Payload constraints, all enforced by `BootstrapAdminCreate`:

- `phone_number`: Philippine E.164 only (`^\+639\d{9}$`), or `null`
- `password`: 8 to 128 characters with at least one uppercase, one lowercase, and one digit
- `email`: optional, `null` if unused
- `terms_accepted`: must be `false` here; consent is the operator's to give at first login, not the installer's

Expect `{"status": "created"}`. Other outcomes:

| Output | Meaning |
|---|---|
| `{"status": "skipped", ...}` | An admin already exists. The script is a no-op; it never creates a second one. |
| `{"errors": [...]}` (exit 2) | Validation or uniqueness failure you can correct and retry, one entry per field. |
| `{"error": "Unable to bootstrap the admin account"}` (exit 3) | Infrastructure failure. Database details are deliberately withheld from the terminal; check the `api` logs. |

Check state at any time with `docker compose exec -T api python -m app.scripts.bootstrap_admin --status`,
which reports `missing`, `pending-password-change`, or `configured`.

The initial password is **one-shot**: the account is created with `must_change_password` set, so the
first dashboard login forces a password change and acceptance of the Terms & Conditions. Running
bare-metal instead? Same module, invoked directly: `cd server && app/venv/bin/python -m app.scripts.bootstrap_admin`.

For production installs, `deploy/scripts/bootstrap-admin.sh` wraps this with interactive prompts and
a retry loop. See [docker-bundle.md](../deployment/docker-bundle.md).

## Other commands

| Command | Description |
|---|---|
| `pnpm run build` | Production build (`output: "standalone"`) |
| `pnpm run start` | Serve production build |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | `tsc --noEmit \|\| true`, which reports type errors but always exits 0, so it never fails CI or a pre-commit hook |

There is no test script in this component.

> `next.config.ts` also sets `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds`, so
> `pnpm run build` succeeds despite type or lint errors. Run `lint` and `typecheck` yourself; a green
> build does not imply either passed.

## Next

- [environment-config.md](../deployment/environment-config.md) for how `API_DOMAIN` relates to the other components' env vars.
- [deployment/admin-frontend.md](../deployment/admin-frontend.md) for deploying this app beyond local dev.
