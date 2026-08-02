# Mobile App — EAS Build & Deployment

The SAPOT mobile app (`mobile-app/sapot-mobile-app/`) is an Expo managed-workflow React Native app built with EAS Build (Android only).

---

## Build profiles (`eas.json`)

| Profile | Distribution | Build type | `APP_VARIANT` | OTA channel |
|---|---|---|---|---|
| `development` | internal | APK + dev client | `development` | development |
| `preview` | internal | APK | `preview` | preview |
| `production` | internal | APK (autoIncrement) | _(unset)_ | production |

All profiles produce **APK** files distributed internally (sideloaded). There is no Play Store submission.

---

## App variants

`app.config.ts` reads `APP_VARIANT` at build time:

| Variant | App name | Package ID |
|---|---|---|
| `development` | SAPOT (Dev) | `com.devamt.sapotmobileapp.dev` |
| `preview` | SAPOT (Preview) | `com.devamt.sapotmobileapp.preview` |
| _(unset)_ | SAPOT: LAN Messenger | `com.devamt.sapotmobileapp` |

---

## TLS CA pinning

The app pins a private **CA** (not the server's leaf certificate) at build time:

1. Place the CA's PEM at `mobile-app/sapot-mobile-app/server_ca.pem`.
2. The `withServerCa` config plugin copies it into `android/app/src/main/res/raw/server_ca.pem`.
3. The `withNetworkSecurityConfig` plugin writes `network_security_config.xml`:
   - **Dev builds** — cleartext permitted; `system` + `user` + bundled `@raw/server_ca` trusted (so Metro and a locally-trusted dev cert both work).
   - **Preview/Production builds** — `cleartextTrafficPermitted="false"`, scoped to the domain `server.sapot.lan` (`includeSubdomains="false"`), trusting only `@raw/server_ca`.

Because the pin is on the CA, the server can rotate its leaf certificate with **no mobile rebuild**;
only a CA rotation requires one. There is no hardcoded IP in the network-security config — the
pin is scoped to the hostname `server.sapot.lan`, so the server's LAN IP can change freely as long
as that name still resolves to it.

For EAS cloud builds, set the `SERVER_CA` environment variable (EAS secret) to the base64-encoded
CA PEM. `app.config.ts` decodes it to `server_ca.pem` at prebuild time, and the `IS_REAL_EAS_BUILD`
guard **refuses** a non-dev build if `server_ca.pem` is still the committed placeholder
(subject matching `/placeholder/i`) or has expired.

---

## Android signing

The prebuild hook (`hooks.prebuild`) runs:

```bash
node ./scripts/setup-android-signing.js
```

This script configures `android/app/build.gradle` with signing credentials. For EAS builds, set signing credentials via EAS Secrets (not in source).

---

## EAS Expo Updates (OTA)

The app uses Expo Updates for over-the-air JS bundle delivery:

- **Expo project ID:** `ee940ed5-5653-43cb-8938-d5f54a830c59`
- **Runtime version:** `preview` (all channels share the same native binary)
- **Update URL:** `https://u.expo.dev/ee940ed5-5653-43cb-8938-d5f54a830c59`

Channel routing:

| EAS build profile | OTA channel |
|---|---|
| `development` | development |
| `preview` | preview |
| `production` | production |

OTA updates apply only to JS bundles. Any change that modifies native code (new native module, permission, config plugin) requires a full EAS build.

---

## Required Android permissions

Declared in `app.config.ts` `android.permissions`:

- `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE` — LAN peer discovery
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_DATA_SYNC`, `RECEIVE_BOOT_COMPLETED` — background connectivity
- `BLUETOOTH`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADMIN` — audio routing
- `WAKE_LOCK` — keep connection alive
- `INTERNET` — LAN sockets (despite "Internet" label, used for LAN TCP/WebSocket)
- `CAMERA`, `RECORD_AUDIO` — video/voice calls
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` — GPS feature
- `VIBRATE`, `SYSTEM_ALERT_WINDOW` — notifications and incoming calls

---

## Local development build

```bash
cd mobile-app/sapot-mobile-app/
pnpm install
npx expo run:android
```

For EAS local build:

```bash
eas build --platform android --profile development --local
```

---

## Build commands

```bash
# Preview APK (internal distribution)
eas build --platform android --profile preview

# Production APK
eas build --platform android --profile production

# Push an OTA update to a channel
eas update --channel preview --message "fix: crash on startup"
```

---

> **TODO (human input required):** Document Sentry release tracking setup, signing keystore rotation procedure, and the exact EAS Secrets keys required for CI builds.
