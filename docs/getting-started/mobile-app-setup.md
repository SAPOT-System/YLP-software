# Mobile App Setup

Source: `mobile-app/README.org` and `mobile-app/sapot-mobile-app/README.md`.

## Prerequisites

- Node >= 18, npm 10.8.2
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
npm install
```

## Configure the dev server host

Point the app at your server's LAN IP (the machine running [server setup](server-setup.md)):

```bash
# .env.local (mobile-app/sapot-mobile-app/)
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

See [environment-config.md](../deployment/environment-config.md) for the full mobile app env var list.

**The app always talks HTTPS, including in development** (`config/runtime.ts`'s `getApiUrl`/`getWsUrl` return `https://`/`wss://` for every build variant, dev included) — see [Configure TLS trust for local development](#configure-tls-trust-for-local-development) below before running `server-setup.md`'s dev server, or the app will fail to connect.

## Configure TLS trust for local development

The mobile app uses CA-pinned TLS trust (`modules/sapot-trust/`, full design in `mobile-app/sapot-mobile-app/docs/superpowers/plans/2026-07-10-tls-trust-migration.md`), so your local FastAPI dev server needs to terminate TLS with a certificate the app will trust. The dev build's network-security-config (`app.config.ts`'s `withNetworkSecurityConfig`) trusts three anchors, so pick whichever is least friction:

- **System/user CA store** — install your own CA on the emulator/device as a user-trusted certificate, then issue a server leaf from it. Trusted automatically in dev builds (`<certificates src="system"/>` / `<certificates src="user"/>`).
- **Bundled default CA** (`mobile-app/sapot-mobile-app/server_ca.pem`) — issue a leaf signed by this CA for your dev server. Same `openssl` steps as "Issue a new server leaf from the CA" in [runbooks.md](../deployment/runbooks.md#tls-certificate-rotation-ca-pinned-server-leaf), but point the SAN at your dev machine's LAN IP instead of the prod server's.
- **Runtime-imported CA** — generate any throwaway CA + leaf pair (see "Create the Root CA" in [runbooks.md](../deployment/runbooks.md#offline-ca-setup)), issue the server leaf, then run a debug build (`IS_DEBUG_ENABLED` — see below) and import the CA `.pem` via the server-provisioning screen or a provisioning QR code. This CA is never honored in release builds.

Point your dev FastAPI server at the resulting cert/key (e.g. `uvicorn --ssl-certfile server.crt --ssl-keyfile server.key`).

## Run

```bash
npm run dev            # Expo dev server
# or, for a native Android build:
npm run prebuild         # expo prebuild --clean (development variant)
npm run android           # build and install on device/emulator
```

Then open the app's getting-started screen, tap **Server Mode**, open the settings icon, and enter your laptop's LAN IP address (must match `EXPO_PUBLIC_DEV_HOST` and be on the same WiFi network as the server).

## Optional: GPS map tiles

If testing the GPS map, download the `.mbtiles` file (see `mobile-app/sapot-mobile-app/README.md` for the current link) and set up the tile server from `tileserver/` with `deploy-tiling-server.sh`.

## Verify

- `npm run typecheck`, `npm run lint`, `npm test` — see [`mobile-app/sapot-mobile-app/docs/TESTING.md`](../../mobile-app/sapot-mobile-app/docs/TESTING.md).

## Testing the server-provisioning flow

The manual server-provisioning screen (host + CA import, QR scan, mDNS auto-detect) only renders when `IS_DEBUG_ENABLED` is true (`config/debug.ts`) — true automatically for any `__DEV__` build (`npm run android`/`npm run dev`), or for a `preview` EAS build with `EXPO_PUBLIC_DEBUG_MENU=1` set. It never renders in `production`.

To exercise it: Settings → server provisioning. From there you can enter an IP manually, scan a provisioning QR (IP + CA fingerprint), tap **Auto-detect** to find a server advertising `_sapot-server._tcp.local.` over mDNS, or import a CA `.pem` directly. See `mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md`'s `CertProvisioningService`/`discoverServerIp` entries for what each path does under the hood.

## Next

- [`mobile-app/sapot-mobile-app/docs/ONBOARDING.md`](../../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) for a deeper architectural walkthrough.
