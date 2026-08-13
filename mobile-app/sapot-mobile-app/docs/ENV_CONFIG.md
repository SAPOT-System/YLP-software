# Environment & Build Configuration

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_DEV_HOST` | Dev only | Your machine's LAN IP for local API/WS (e.g. `192.168.1.16`) |
| `EXPO_PUBLIC_ENABLED_LOG_MODULES` | Optional | Comma-separated log scope names to enable. Leave unset to enable all. |
| `EXPO_PUBLIC_LOG_LEVEL` | Optional | Severity floor: `debug`\|`info`\|`warn`\|`error`. Composes with `EXPO_PUBLIC_ENABLED_LOG_MODULES` (module filter AND severity floor). Defaults to `debug` in dev / `error` in production. An unrecognised value falls back to the default with a console warning. |
| `EXPO_PUBLIC_LOG_TO_FILE` | Optional | Set to `1` to write logs to a daily on-device file in development. On-device file logging is always on in production builds. |
| `EXPO_PUBLIC_LOG_TO_LAPTOP` | Optional | In development, ship logs to the laptop log collector. On by default in dev; set to `0` to disable. |
| `EXPO_PUBLIC_LOG_SERVER_PORT` | Optional | Port the laptop log collector listens on (default `19000`). Must match `LOG_SERVER_PORT` used by `pnpm run log-server`. |
| `EXPO_PUBLIC_DEBUG_MENU` | Optional | Set to `1` to opt a non-dev build (e.g. `preview`/QA) into the developer debug menu (`config/debug.ts`). Always on in `__DEV__` regardless of this flag; the `production` EAS profile must never set it, since debug code is gated behind this flag and dead-code-eliminated by Metro when it's unset. |
| `EXPO_PUBLIC_SERVER_VERIFY_KEY` | Optional | Base64 Ed25519 public key used to verify the server's signature on peer key payloads (`config/runtime.ts`'s `getServerVerifyKey()`). When unset, `PeerKeyService` falls back to fetching `GET /keys/server-public-key`. |
| `EXPO_PUBLIC_QA_API_TOKEN` | Dev/QA only | Sent as the `X-QA-Token` header by `loginAsFixtureApi` to mint tokens for seeded `qa_*` fixture accounts. Must match the server's `QA_API_TOKEN`, and only works when the server runs with `ENVIRONMENT=development`. |

### Setting up local env

Create a `.env.local` file in the project root:

```env
EXPO_PUBLIC_DEV_HOST=192.168.1.x
```

### Log module scopes

```env
EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background
```

Scope names are the string passed to `createScopedLogger()` in
`features/shared/core/utils/logger.ts` — several exported loggers share one scope (`schemaLog`,
`migrationLog`, `modelLog` and `dbLog` all log under `database`), so filter by the scope name
below, not the exported variable name:

`adapter`, `api`, `app`, `auth`, `auth-api`, `auth-components`, `auth-hooks`, `auth-index`,
`auth-types`, `auth-utils`, `background`, `call`, `chat`, `chat-types`, `cleanup`, `config`,
`connection`, `context`, `database`, `discovery`, `gps`, `guest-user`, `health`, `hook`,
`layout`, `mode`, `nav`, `network`, `peer`, `profile-photo`, `repository`, `routes`, `service`,
`session`, `shared`, `signaling`, `store`, `sync`, `tcp`, `types`, `ui`, `user`, `util`,
`webrtc`, `ws`, `zeroconf`

### Log severity floor

```env
EXPO_PUBLIC_LOG_LEVEL=warn
```

Only logs at or above this severity are emitted, regardless of which modules are enabled. Unset defaults to `debug` in dev and `error` in production (current behaviour).

### File logging

The logger (`features/shared/core/utils/logger.ts`) also writes log output to a file
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
pnpm run log-server

# 2. Run the app in dev as usual — laptop logging is on by default
pnpm run dev
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

Controlled by `APP_VARIANT` environment variable. Set automatically by the `package.json` scripts.

| Variant | Bundle ID | App Name |
|---|---|---|
| `development` | `com.devamt.sapotmobileapp.dev` | SAPOT (Dev) |
| `preview` | `com.devamt.sapotmobileapp.preview` | SAPOT (Preview) |
| `production` | `com.devamt.sapotmobileapp` | SAPOT: LAN Messenger |

Configured in `app.config.ts`.

---

## API & WebSocket URL Resolution

Logic in `config/runtime.ts`:

`getApiUrl()`, `getWsUrl()` and `getTileServerUrl()` all apply the same precedence, in order:

1. **Host override** — if `setRuntimeHostOverride(host)` has been called, it wins unconditionally.
2. **`__DEV__`** — uses `EXPO_PUBLIC_DEV_HOST`.
3. **EAS channel** (`Updates.channel`) — `preview` and `production` both use `SERVER_NAME`.
4. **Fallback** — any other channel value (including an unset channel in a bare release build)
   falls back to `EXPO_PUBLIC_DEV_HOST`. A `preview`/`production` build with an unrecognised
   channel therefore points at the dev host, not the server.

| Condition | API Base URL | WS Base URL | Tile Server URL |
|---|---|---|---|
| Host override set | `https://<override>` | normalized override, secure unless explicit local development | `https://<override>/tiles` |
| `__DEV__ === true` | `https://<DEV_HOST>` | `wss://<DEV_HOST>` | `https://<DEV_HOST>/tiles` |
| EAS channel `preview` | `https://server.sapot.lan` | `wss://server.sapot.lan` | `https://server.sapot.lan/tiles` |
| EAS channel `production` | `https://server.sapot.lan` | `wss://server.sapot.lan` | `https://server.sapot.lan/tiles` |
| Any other channel | `https://<DEV_HOST>` | `wss://<DEV_HOST>` | `https://<DEV_HOST>/tiles` |

`server.sapot.lan` is a stable, build-time-fixed hostname (`config/runtime.ts`'s `SERVER_NAME` constant), resolved via normal DNS/hosts on the network — it is not baked to a literal IP, so the server's IP can change without a mobile rebuild as long as `server.sapot.lan` still resolves to it (see the cert-rotation runbook's SAN, which includes both the DNS name and the LAN IP). To point to a different backend locally, update `DEV_HOST` in `config/runtime.ts` or set `EXPO_PUBLIC_DEV_HOST`, or use the dev/QA host override (`setRuntimeHostOverride`, persisted via `secure-config.ts`).

Preview and production builds require WSS. `normalizeWebSocketUrl()` rejects `ws://` and `http://` outside `__DEV__`. Local development still defaults to WSS, but may use an explicit `ws://` or `http://` origin when a TLS terminator is unavailable. Production REST and tile URLs remain HTTPS-only.

The mobile signaling and GPS clients both use this shared normalization. They connect to token-free paths and pass `["sapot.jwt", accessToken]` to the WebSocket constructor. Reconnects reuse the current token through the same contract.

---

## TLS Trust (CA-pinned)

Preview and production builds connect to the server over TLS using a **private CA** pinned via Android's network-security-config (`app.config.ts`'s `withServerCa`/`withNetworkSecurityConfig`) — the app trusts the CA, not the leaf, so the server can rotate its leaf certificate without a mobile rebuild; only a CA rotation requires one. Architecture: `docs/ARCHITECTURE.md`.

| File | Location | Notes |
|---|---|---|
| Default CA (public) | `mobile-app/sapot-mobile-app/server_ca.pem` (repo root), copied into `res/raw/server_ca.pem` at prebuild | Committed to repo — safe to share (public cert, not the CA private key) |
| CA private key | Kept offline per `docs/deployment/runbooks.md`'s CA runbook | Never committed |
| `SERVER_CA` (EAS secret) | Base64-encoded CA PEM, materialized into `server_ca.pem` at prebuild time by `app.config.ts` | Set via `eas secret:create` for the relevant build profile |

`app.config.ts` refuses to produce a real (non-dev) EAS build if `server_ca.pem` is still the placeholder or has expired — see the `IS_REAL_EAS_BUILD` guard. Check the pinned CA's fingerprint offline: `openssl x509 -in server_ca.pem -noout -fingerprint -sha256`.

**Rotating the CA** (rare — invalidates all existing installs' trust until updated): see the "CA rotation" runbook in `docs/deployment/runbooks.md`.

**Rotating the server leaf** (routine — no app change needed, since the app trusts the CA, not the leaf): re-issue a CA-signed leaf on the server; existing app installs keep working with zero changes, per the same runbook.

---

## EAS Build Profiles

Defined in `eas.json`.

| Profile | Command | Use case |
|---|---|---|
| `development` | `pnpm run android:dev` | Local dev with dev client |
| `preview` | `pnpm run android:prev` | Internal testing / QA |
| `production` | `pnpm run android:prod` | Play Store release |

The `SERVER_CA` EAS secret (base64-encoded CA PEM) must be set for `preview` and `production` builds — see the "TLS Trust" section above.

---

## Secure Storage

Sensitive runtime config is stored via `expo-secure-store` (not AsyncStorage).

Managed in `features/shared/core/stores/secure-config.ts`:

All nine keys are declared in that file's `KEYS` constant:

| Key | Value |
|---|---|
| `access_token` | Current session's JWT (read via `getStoredAccessToken`; written via `saveAccessToken`/cleared via `clearAccessToken`) |
| `syncLastPulledAt` | Last successful sync pull timestamp (Unix ms, stored as string) |
| `serverHostOverride` | Dev/QA host override consumed by `config/runtime.ts` (`setRuntimeHostOverride`) |
| `appMode` | Persisted transport mode (`auto` / `server` / `lan`) |
| `deviceEncryptionKey` | At-rest encryption key for the local database |
| `masterKey` | User's master key (unwrapped) |
| `signalingSecretKey` | Secret key used for signalling-channel encryption |
| `recoveryTokenHex` | Recovery session token, hex-encoded |
| `guestMigrationState` | Guest→registered-account migration progress state |

Connection details and profile fields stay in memory while the app runs. They are not copied to secure storage because the Android foreground service keeps the existing JavaScript process alive instead of constructing a second transport stack.

`saveAccessToken`/`clearAccessToken` are also used by the gated Auth debug section (`features/debug/services/debug-auth-service.ts`) to inject/clear a fake JWT for testing — see `docs/TESTING.md`.

---

## App Version

The version is stored in **two** places, which `scripts/set-version.js` (via
`scripts/version-sync.js`) keeps in step: `package.json`'s `version` and `app.config.ts`'s
`version`. Don't hardcode the number here — read it from those files, and bump it with
`./scripts/release.sh mobile <version>` from the repo root rather than editing either by hand.

The two fields must always match. `scripts/version-sync.js` writes both from a single version
argument (`bumpPackageJson` for `package.json`, `syncAppConfig` for `app.config.ts`'s `version`
and `displayVersion`), which is why bumping through the release script — not by hand — is what
keeps them in step.

Runtime requirements (from `package.json`):
- Node >= 18 (`engines.node`)
- pnpm 9.15.9 (`packageManager`)
- React Native 0.81.5
- Expo ~54.0.36
- New Architecture enabled (`newArchEnabled: true` in `app.config.ts`)
