# Environment & Build Configuration

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_DEV_HOST` | Dev only | Your machine's LAN IP for local API/WS (e.g. `192.168.1.16`) |
| `EXPO_PUBLIC_ENABLED_LOG_MODULES` | Optional | Comma-separated log scope names to enable. Leave unset to enable all. |
| `EXPO_PUBLIC_LOG_TO_FILE` | Optional | Set to `1` to write logs to a daily on-device file in development. On-device file logging is always on in production builds. |
| `EXPO_PUBLIC_LOG_TO_LAPTOP` | Optional | In development, ship logs to the laptop log collector. On by default in dev; set to `0` to disable. |
| `EXPO_PUBLIC_LOG_SERVER_PORT` | Optional | Port the laptop log collector listens on (default `19000`). Must match `LOG_SERVER_PORT` used by `npm run log-server`. |

### Setting up local env

Create a `.env.local` file in the project root:

```env
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

### Log module scopes

```env
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

Available scopes: `connection`, `network`, `background`, `config`, `auth`, `chat`, `signaling`, `webrtc`, `tcp`, `sync`, `call`, `api`, `schema`, `app`, `type`

### File logging

The logger (`features/shared/utils/logger.ts`) also writes log output to a file
via `react-native-logs`' `fileAsyncTransport`:

- **When:** always on in production builds; in development only when `EXPO_PUBLIC_LOG_TO_FILE=1`.
- **Where:** the app document directory (`expo-file-system` `Paths.document`), one file per day named `sapot-{date-today}.log` (ISO date, e.g. `sapot-2026-6-3.log`).
- **What:** the same entries that pass the active severity (`error` in production, `debug+` in dev) and scope filters.

Helpers `getLogFilePath()` and `clearLogFile()` are exported for retrieving or
clearing the current day's log file.

```env
EXPO_PUBLIC_LOG_TO_FILE=1
```

### Development logs on your laptop

In development the device/emulator can't write to the laptop's disk, so the
logger POSTs log lines to a small collector that runs on the laptop and writes
them to **per-dev-client files**, separated by Metro/dev-server port:

```
dev-logs/
  dev-8081.log   # logs from the client served on Metro port 8081
  dev-8082.log   # a second concurrent dev client
```

The laptop host and dev-client port are read from the running bundle URL
(`NativeModules.SourceCode.scriptURL`), so each Metro instance gets its own file
automatically. The `dev-logs/` directory is git-ignored.

**Usage:**

```bash
# 1. Start the collector on your laptop (default port 19000)
npm run log-server

# 2. Run the app in dev as usual — laptop logging is on by default
npm run dev
```

For an **Android emulator** (which reaches the laptop via `localhost`/adb), also
forward the collector port:

```bash
adb reverse tcp:19000 tcp:19000
```

Disable with `EXPO_PUBLIC_LOG_TO_LAPTOP=0`. Change the port with
`EXPO_PUBLIC_LOG_SERVER_PORT` (app) + `LOG_SERVER_PORT` (server) — keep them in sync.

---

## App Variants

Controlled by `APP_VARIANT` environment variable. Set automatically by npm scripts.

| Variant | Bundle ID | App Name |
|---|---|---|
| `development` | `com.devamt.sapotmobileapp.dev` | SAPOT (Dev) |
| `preview` | `com.devamt.sapotmobileapp.preview` | SAPOT (Preview) |
| `production` | `com.devamt.sapotmobileapp` | SAPOT: LAN Messenger |

Configured in `app.config.ts`.

---

## API & WebSocket URL Resolution

Logic in `config/runtime.ts`:

| Condition | API Base URL | WS Base URL |
|---|---|---|
| `__DEV__ === true` | `http://<DEV_HOST>:8000` | `ws://<DEV_HOST>:8000` |
| EAS channel `preview` | `https://192.168.0.100:8000` | `wss://192.168.0.100:8000` |
| EAS channel `production` | `https://192.168.0.100:8000` | `wss://192.168.0.100:8000` |

To point to a different backend locally, update `DEV_HOST` in `config/runtime.ts` or set `EXPO_PUBLIC_DEV_HOST`.

---

## TLS Certificate

Preview and production builds connect to the LAN server over TLS using a self-signed certificate pinned in the APK.

| File | Location | Notes |
|---|---|---|
| Public cert | `android/app/src/main/res/raw/server_cert.pem` | Committed to repo — safe to share |
| Private key | `/home/sapot/certs/server.key` on server only | Never committed |

Check expiry: `openssl x509 -in android/app/src/main/res/raw/server_cert.pem -noout -enddate`

**Renewing the cert:**
1. Re-run the openssl command from `server/.env.example`
2. Copy new `server.crt` to `android/app/src/main/res/raw/server_cert.pem`
3. Update `android-network-security-config.xml` if the server IP changed
4. Restart the server (`pkill -f gunicorn && bash runserver.sh &`)
5. Ship a new app build — existing installs reject the new cert until updated (OTA cannot update `res/raw/`)

---

## EAS Build Profiles

Defined in `eas.json`.

| Profile | Command | Use case |
|---|---|---|
| `development` | `npm run android:dev` | Local dev with dev client |
| `preview` | `npm run android:prev` | Internal testing / QA |
| `production` | `npm run android:prod` | Play Store release |

---

## Secure Storage

Sensitive runtime config is stored via `expo-secure-store` (not AsyncStorage).

Managed in `features/shared/stores/secure-config.ts`:

| Key | Value |
|---|---|
| `peerId` | Current user's ID |
| `wsUrl` | WebSocket server URL |
| `tcpHost` | Peer TCP host |
| `tcpPort` | Peer TCP port |
| `localIp` | Device's current LAN IP |

This config is also read by the background task (`task/signaling-task.ts`) on Android when the app is killed.

---

## App Version

Current version: `0.2.0` (in `app.config.ts`)

Runtime requirements:
- Node >= 18
- npm 10.8.2
- React Native 0.81.5
- Expo ~54.0.33
- New Architecture enabled
