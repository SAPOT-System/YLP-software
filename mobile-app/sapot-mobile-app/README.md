# SAPOT — LAN Messenger

A peer-to-peer mobile messenger built with React Native / Expo. Supports direct LAN communication via WebRTC + TCP and server-relayed communication via WebSocket.

---

## Prerequisites

- Node >= 18
- npm 10.8.2
- Android SDK (for device/emulator builds)
- EAS CLI (`npm install -g eas-cli`) for cloud builds

---

## Local Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set your local dev host** — open `config/runtime.ts` and update `DEV_HOST` to your machine's LAN IP, or set it via env:
   ```bash
   # .env.local
   EXPO_PUBLIC_DEV_HOST=192.168.1.x
   ```

3. **Start the dev server**
   ```bash
   npm run dev
   ```

4. **Run on Android device/emulator**
   ```bash
   npm run prebuild     # generates native Android project
   npm run android      # builds and installs on device
   ```

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start Expo dev server (`APP_VARIANT=development`) |
| `npm run prebuild` | `expo prebuild --clean` for development variant |
| `npm run android` | Build and run on Android device |
| `npm run android:dev` | EAS cloud build — development profile |
| `npm run android:prev` | EAS cloud build — preview profile |
| `npm run android:prod` | EAS cloud build — production profile |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm test` | Run all Jest tests |

---

## Documentation

| Doc | Description |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, DI containers, service map |
| [`docs/CALL_FLOW.md`](docs/CALL_FLOW.md) | Call lifecycle and message sequence |
| [`docs/API.md`](docs/API.md) | REST API endpoint reference |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Local WatermelonDB schema reference |
| [`docs/ENV_CONFIG.md`](docs/ENV_CONFIG.md) | Environment variables and build config |
| [`docs/TESTING.md`](docs/TESTING.md) | Testing guide and utilities |
| [`features/shared/services/CONNECTION_MESSAGES.md`](features/shared/services/CONNECTION_MESSAGES.md) | WebSocket / TCP message protocol |
