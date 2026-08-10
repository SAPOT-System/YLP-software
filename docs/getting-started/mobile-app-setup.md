# Mobile App Setup

This is the canonical setup guide. `mobile-app/README.org` and `mobile-app/sapot-mobile-app/README.md` point here for full instructions and cover only content not duplicated here (WSL/Android troubleshooting, command quick-reference).

## Prerequisites

- Node >= 18 (`package.json`'s `engines`), [pnpm](https://pnpm.io/) (this project's declared package manager, pinned via `package.json`'s `packageManager` field to `pnpm@9.15.9`; Corepack will fetch the exact version automatically if enabled)
- [Nix](https://nixos.org/) (used to pin the dev toolchain via flakes)
- Android SDK (for device/emulator builds) — see the WSL2/Android Studio tips in `mobile-app/README.org` if you're on WSL
- EAS CLI (`pnpm add -g eas-cli`) for cloud builds

## Install Nix and the dev shell

```bash
# Linux / WSL:
sh <(curl --proto '=https' --tlsv1.2 -L https://nixos.org/nix/install) --daemon
# restart your shell, then if `nix` isn't found:
source /etc/profile.d/nix.sh

# from mobile-app/ :
bash configure_nix.sh   # configures Nix to process flakes
nix develop -L           # enters the pinned dev shell
cd sapot-mobile-app
pnpm install
cp .env.example .env
```

## Configure the dev server host

Point the app at your server's LAN IP (the machine running [the Docker setup](docker-setup.md)) in
the `.env` you copied above:

```dotenv
# mobile-app/sapot-mobile-app/.env
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

`config/runtime.ts` builds every URL from this one value: `https://<host>` for the API,
`wss://<host>` for WebSocket, `https://<host>/tiles` for map tiles. There is no
`EXPO_PUBLIC_API_URL`; the base URL is not separately configurable. At runtime the app's Server Mode
settings dialog can override the host without an env change, and that override wins over
`EXPO_PUBLIC_DEV_HOST`.

See [environment-config.md](../deployment/environment-config.md) for the full mobile app env var list.

**The app always talks HTTPS, including in development** (`config/runtime.ts`'s `getApiUrl`/`getWsUrl` return `https://`/`wss://` for every build variant, dev included). [docker-setup.md](docker-setup.md)'s Nginx TLS terminator handles this for you automatically. Running the server bare-metal instead (`server-setup.md`)? See [Configure TLS trust for local development](#configure-tls-trust-for-local-development) below before starting it, or the app will fail to connect.

## Configure TLS trust for local development

The mobile app pins the server's CA certificate via Android's network-security-config (`app.config.ts`'s `withServerCa`/`withNetworkSecurityConfig`, using `mobile-app/sapot-mobile-app/server_ca.pem`), so your local FastAPI dev server needs to terminate TLS with a certificate the app will trust. The dev build's network-security-config trusts two anchors, so pick whichever is least friction:

- **System/user CA store** — install your own CA on the emulator/device as a user-trusted certificate, then issue a server leaf from it. Trusted automatically in dev builds (`<certificates src="system"/>` / `<certificates src="user"/>`).
- **Bundled default CA** (`mobile-app/sapot-mobile-app/server_ca.pem`) — issue a leaf signed by this CA for your dev server. Same `openssl` steps as "Issue a new server leaf from the CA" in [runbooks.md](../deployment/runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf), but point the SAN at your dev machine's LAN IP instead of the prod server's.

Point your dev FastAPI server at the resulting cert/key (e.g. `uvicorn --ssl-certfile server.crt --ssl-keyfile server.key`).

## Run

```bash
pnpm dev                # Expo dev server (APP_VARIANT=development)
# or, for a native Android build:
pnpm run prebuild        # expo prebuild -p android --clean, then scripts/setup-android-signing.js
pnpm run android         # expo run:android --app-id com.devamt.sapotmobileapp.dev
```

Then open the app's getting-started screen, tap **Server Mode**, tap the cog icon on that card, and enter your laptop's LAN IP address (must match `EXPO_PUBLIC_DEV_HOST` and be on the same WiFi network as the server). The other option, **LAN Mode**, skips the server entirely and asks only for a name. See [quickstart.md](quickstart.md#4-register-a-user-and-verify-end-to-end-messaging).

## Optional: GPS map tiles

The [Docker stack](docker-setup.md) already runs a `tileserver` service behind Nginx at
`https://<host>/tiles/`, which is exactly where `config/runtime.ts`'s `getTileServerUrl()` looks, so
if you are running that stack, the map works with no extra setup beyond supplying the data. The
`.mbtiles` file itself is gitignored: download it (see `mobile-app/sapot-mobile-app/README.md` for
the current link) into `tileserver/` and name it `osm-batangas.mbtiles`, because that exact filename is what
`docker-compose.yml` passes to `tileserver-gl`, then restart the service.

Running the tileserver standalone instead? Use `deploy-tiling-server.sh` from `tileserver/`.

## Verify

- `pnpm run typecheck`, `pnpm run lint`, `pnpm test` — see [the mobile app testing documentation](pathname:///mobile-docs/TESTING).

## Next

- [The mobile app onboarding documentation](pathname:///mobile-docs/ONBOARDING) for a deeper architectural walkthrough.
