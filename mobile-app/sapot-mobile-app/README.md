# SAPOT — LAN Messenger

A peer-to-peer mobile messenger built with React Native / Expo. Supports direct LAN communication via WebRTC + TCP and server-relayed communication via WebSocket.

New here? Start with [`docs/ONBOARDING.md`](docs/ONBOARDING.md).

---

## Setup

Full setup instructions (prerequisites, Nix dev shell, dev host config, TLS trust, running the app) live in the root docs: [`docs/getting-started/mobile-app-setup.md`](../../docs/getting-started/mobile-app-setup.md).

Quick reference once the dev shell is set up:

```bash
pnpm install
pnpm dev              # Expo dev server
pnpm run prebuild      # expo prebuild --clean (development variant)
pnpm run android       # build and install on device/emulator
```

---

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start Expo dev server (`APP_VARIANT=development`) |
| `pnpm run prebuild` | `expo prebuild --clean` for development variant |
| `pnpm run android` | Build and run on Android device |
| `pnpm run android:dev` | EAS cloud build — development profile |
| `pnpm run android:prev` | EAS cloud build — preview profile |
| `pnpm run android:prod` | EAS cloud build — production profile |
| `pnpm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `pnpm run lint` | ESLint |
| `pnpm test` | Run all Jest tests |

## Documentation

See [`docs/`](docs/) for the full documentation set, or the indexed table in the root [`docs/README.md`](../../docs/README.md#mobile-app-detailed).

## Tester Guide

For manual testing, start the backend first — see [`docs/getting-started/docker-setup.md`](../../docs/getting-started/docker-setup.md) (recommended) or [`server-setup.md`](../../docs/getting-started/server-setup.md) (bare-metal).

> **Important:** The laptop and cellphone must be connected to the same WiFi network.

> If you run into any problem, message [Adriele Tosino](https://www.facebook.com/adrieletosino) on Messenger.

Then open the getting-started screen in the app, tap Server Mode, tap the settings icon, and enter your laptop's LAN IP address.

If you are testing the GPS map, download the `.mbtiles` file from https://drive.google.com/file/d/1UVakmRkrHaz2J1cgCIbkAHsHDW9SYwLq/view?usp=sharing, then set up the tile server from `tileserver/` with `deploy-tiling-server.sh`.
