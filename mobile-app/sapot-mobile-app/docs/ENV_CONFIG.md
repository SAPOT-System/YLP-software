# Environment & Build Configuration

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_DEV_HOST` | Dev only | Your machine's LAN IP for local API/WS (e.g. `192.168.1.16`) |
| `EXPO_PUBLIC_ENABLED_LOG_MODULES` | Optional | Comma-separated log scope names to enable. Leave unset to enable all. |

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
| EAS channel `preview` | `https://sapot.online` | `wss://sapot.online` |
| EAS channel `production` | `https://sapot.online` | `wss://sapot.online` |

To point to a different backend locally, update `DEV_HOST` in `config/runtime.ts` or set `EXPO_PUBLIC_DEV_HOST`.

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
