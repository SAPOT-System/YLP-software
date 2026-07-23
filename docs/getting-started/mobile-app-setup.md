# Mobile App Setup

Source: `mobile-app/README.org` and `mobile-app/sapot-mobile-app/README.md`.

## Prerequisites

- Node >= 18, [pnpm](https://pnpm.io/) (this project's declared package manager, pinned via `package.json`'s `packageManager` field — Corepack will fetch the exact version automatically if enabled)
- [Nix](https://nixos.org/) (used to pin the dev toolchain via flakes)
- Android SDK (for device/emulator builds) — see the WSL2/Android Studio tips in `mobile-app/README.org` if you're on WSL
- EAS CLI (`npm install -g eas-cli`) for cloud builds

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
```

## Configure the dev server host

Point the app at your server's LAN IP (the machine running [server setup (Docker)](server-docker-setup.md)):

```bash
# .env.local (mobile-app/sapot-mobile-app/)
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

See [environment-config.md](../deployment/environment-config.md) for the full mobile app env var list.

**The app always talks HTTPS, including in development** (`config/runtime.ts`'s `getApiUrl`/`getWsUrl` return `https://`/`wss://` for every build variant, dev included). [server-docker-setup.md](server-docker-setup.md)'s Nginx TLS terminator handles this for you automatically. Running the server bare-metal instead (`server-setup.md`)? See [Configure TLS trust for local development](#configure-tls-trust-for-local-development) below before starting it, or the app will fail to connect.

## Configure TLS trust for local development

The mobile app pins the server's CA certificate via Android's network-security-config (`app.config.ts`'s `withServerCa`/`withNetworkSecurityConfig`, using `mobile-app/sapot-mobile-app/server_ca.pem`), so your local FastAPI dev server needs to terminate TLS with a certificate the app will trust. The dev build's network-security-config trusts two anchors, so pick whichever is least friction:

- **System/user CA store** — install your own CA on the emulator/device as a user-trusted certificate, then issue a server leaf from it. Trusted automatically in dev builds (`<certificates src="system"/>` / `<certificates src="user"/>`).
- **Bundled default CA** (`mobile-app/sapot-mobile-app/server_ca.pem`) — issue a leaf signed by this CA for your dev server. Same `openssl` steps as "Issue a new server leaf from the CA" in [runbooks.md](../deployment/runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf), but point the SAN at your dev machine's LAN IP instead of the prod server's.

Point your dev FastAPI server at the resulting cert/key (e.g. `uvicorn --ssl-certfile server.crt --ssl-keyfile server.key`).

## Run

```bash
pnpm dev                # Expo dev server
# or, for a native Android build:
pnpm run prebuild        # expo prebuild --clean (development variant)
pnpm run android         # build and install on device/emulator
```

Then open the app's getting-started screen, tap **Server Mode**, open the settings icon, and enter your laptop's LAN IP address (must match `EXPO_PUBLIC_DEV_HOST` and be on the same WiFi network as the server).

## Optional: GPS map tiles

If testing the GPS map, download the `.mbtiles` file (see `mobile-app/sapot-mobile-app/README.md` for the current link) and set up the tile server from `tileserver/` with `deploy-tiling-server.sh`.

## Verify

- `pnpm run typecheck`, `pnpm run lint`, `pnpm test` — see [`mobile-app/sapot-mobile-app/docs/TESTING.md`](../../mobile-app/sapot-mobile-app/docs/TESTING.md).

## Next

- [`mobile-app/sapot-mobile-app/docs/ONBOARDING.md`](../../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) for a deeper architectural walkthrough.
