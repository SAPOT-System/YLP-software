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
| `EXPO_PUBLIC_DEBUG_MENU` | Optional | Set to `1` to enable dev/QA-only screens (e.g. the manual server-provisioning screen at `SETTINGS_ROUTES.SERVER_PROVISIONING`) in a non-`__DEV__` (preview) build. Never set in production builds — see `config/debug.ts`'s `IS_DEBUG_ENABLED`. |

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
| `__DEV__ === true` | `https://<DEV_HOST or host override>` | `wss://<DEV_HOST or host override>` |
| EAS channel `preview` | `https://server.sapot.lan` | `wss://server.sapot.lan` |
| EAS channel `production` | `https://server.sapot.lan` | `wss://server.sapot.lan` |

`server.sapot.lan` is a stable, build-time-fixed hostname (`config/runtime.ts`'s `SERVER_NAME` constant) — the server's actual IP is resolved at runtime by the native `sapot-trust` module's OkHttp `Dns` (see below), not baked into the app. To point to a different backend locally, update `DEV_HOST` in `config/runtime.ts` or set `EXPO_PUBLIC_DEV_HOST`.

The app always speaks HTTPS/WSS, including in `__DEV__` — there is no plaintext HTTP fallback. Your local dev server must terminate TLS with a cert the dev build's network-security-config trusts (system/user CA store, the bundled default CA, or a CA imported at runtime via the server-provisioning screen); see `docs/getting-started/mobile-app-setup.md`'s "Configure TLS trust for local development" section.

---

## TLS Trust (CA-pinned, runtime-provisioned)

Preview and production builds connect to the server over TLS using a **private CA** pinned via Android network-security-config, plus a runtime `X509TrustManager`/`Dns` pair (local Expo module `modules/sapot-trust/`) that decouples cert identity from the server's IP. Full design: `docs/superpowers/plans/2026-07-10-tls-trust-migration.md`; architecture: `docs/ARCHITECTURE.md`.

| File | Location | Notes |
|---|---|---|
| Default CA (public) | `mobile-app/sapot-mobile-app/server_ca.pem` (repo root); also bundled at `modules/sapot-trust/android/src/main/assets/server_ca.pem` and copied into `res/raw/server_ca.pem` / `android/app/src/main/assets/server_ca.pem` at prebuild | Committed to repo — safe to share (public cert, not the CA private key) |
| CA private key | Kept offline per `docs/deployment/runbooks.md`'s CA runbook | Never committed |
| `SERVER_CA` (EAS secret) | Base64-encoded CA PEM, materialized into `server_ca.pem` at prebuild time by `app.config.ts` | Set via `eas secret:create` for the relevant build profile |
| Runtime CA (dev/QA only) | Imported at runtime via the server-provisioning screen (`SETTINGS_ROUTES.SERVER_PROVISIONING`, gated by `EXPO_PUBLIC_DEBUG_MENU`) | Stored in app-private storage; **never honored in release builds** (`SapotTrustModule.setCaPem` throws when `!BuildConfig.DEBUG`) |

Trust precedence: bundled default CA (always trusted) plus the runtime CA (only when `BuildConfig.DEBUG`, i.e. dev/QA builds). Check the active anchor's fingerprint: `SapotTrust.getActiveFingerprint()` (JS) or `openssl x509 -in server_ca.pem -noout -fingerprint -sha256` (offline).

**Rotating the CA** (rare — invalidates all existing installs' trust until updated): see the "CA rotation" runbook in `docs/deployment/runbooks.md`.

**Rotating the server leaf** (routine — no app change needed, since the app trusts the CA, not the leaf): re-issue a CA-signed leaf on the server; existing app installs keep working with zero changes, per the same runbook.

---

## EAS Build Profiles

Defined in `eas.json`.

| Profile | Command | Use case |
|---|---|---|
| `development` | `npm run android:dev` | Local dev with dev client |
| `preview` | `npm run android:prev` | Internal testing / QA |
| `production` | `npm run android:prod` | Play Store release |

The `SERVER_CA` EAS secret (base64-encoded CA PEM) must be set for `preview` and `production` builds — see the "TLS Trust" section above. `EXPO_PUBLIC_DEBUG_MENU` should only ever be set for the `preview` profile, never `production`.

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
