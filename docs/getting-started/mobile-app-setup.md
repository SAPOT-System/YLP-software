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

## Next

- [`mobile-app/sapot-mobile-app/docs/ONBOARDING.md`](../../mobile-app/sapot-mobile-app/docs/ONBOARDING.md) for a deeper architectural walkthrough.
