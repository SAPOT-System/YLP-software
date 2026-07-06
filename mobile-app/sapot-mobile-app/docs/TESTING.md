# Testing Guide

## Tester Setup

Use this when you need to start the backend locally for manual testing.

> **Important:** The laptop and cellphone must be connected to the same WiFi network.

> If you run into any problem, message [Adriele Tosino](https://www.facebook.com/adrieletosino) on Messenger.

### Tile Server Setup

If you are testing the GPS map:

1. Download the `.mbtiles` file: <https://drive.google.com/file/d/1UVakmRkrHaz2J1cgCIbkAHsHDW9SYwLq/view?usp=sharing>
2. Open `YLP-Software/tileserver/`.
3. Put the `.mbtiles` file in that folder.
4. Run `./deploy-tiling-server.sh`.

### Backend Setup

1. Open a terminal and go to `YLP-Software/server/`.
2. Run the backend setup and server command:

```bash
source app/venv/bin/activate && pip install -r app/requirements.txt && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Leave that terminal running while you test the mobile app.

## Manual App Setup

1. Open the getting-started screen.
2. Tap Server Mode, then tap the settings icon.
3. Enter your laptop's LAN IP address and save.

## Debug Panel — Simulating Offline & Network Conditions

The Debug Panel (`features/debug/`) lets you reproduce disaster-scenario network conditions
— no internet, a dead LAN, a dead server, packet loss, latency — on a single device, without
touching real infrastructure. It only exists in builds where `IS_DEBUG_ENABLED` is true:
always in `__DEV__` (local dev builds), and in any other build (e.g. `preview`/QA) only if
`EXPO_PUBLIC_DEBUG_MENU=1` is set (see `docs/ENV_CONFIG.md`). It is fully absent from
`production`.

### Opening the panel

- **Draggable FAB** — a small floating button, visible anywhere in the app once debug mode is on.
- **5 taps on the version number** — Settings → About Us, tap the version text 5 times.

### Offline section

Six toggles, each independent:

| Toggle | Effect |
|---|---|
| No internet | Drops **all** outbound/inbound traffic on every transport (TCP and WebSocket) |
| LAN down | Drops TCP (peer-to-peer / LAN) traffic only — WebSocket/server traffic is unaffected |
| Server down | Drops WebSocket (server-relay) traffic only — TCP/LAN traffic is unaffected |
| Redis down | **Symptom-only** — flips the reported status so the UI shows "degraded"; no real traffic is blocked |
| Auth down | **Symptom-only** — same as above; real HTTP-level auth failure injection is a separate, not-yet-built debug feature |
| Sync down | The next `SyncService.syncNow()` call (timer-driven or manual "Force sync") is skipped entirely |

"No internet" and "Server down" also flip the server-status banner/indicator elsewhere in the
app (`useServerStatus`), since they force `HealthProvider`'s reported `online` state to `false`.

### Network section

Per-transport (TCP and WebSocket, shown separately) fault sliders:

| Field | Effect |
|---|---|
| Latency (ms) | Delays every message by this many milliseconds before it's sent/delivered |
| Loss rate (0–1) | Probability a message is silently dropped (`1` = every message dropped) |
| Dup rate (0–1) | Probability a message is delivered/sent twice |
| Corrupt rate (0–1) | Probability a message's payload field is garbled before delivery |

Each transport has its own "Reset … faults" button to zero all four fields at once.

### Example scenarios

- **Reproduce "app looks stuck offline"**: toggle *No internet* on, confirm the app shows an
  offline indicator and queues actions instead of hanging.
- **Reproduce flaky LAN chat**: set TCP *Loss rate* to `0.3` and *Latency* to `500`, then send a
  few chat messages between two LAN-paired devices and confirm retries/ordering hold up.
- **Reproduce a stalled sync**: toggle *Sync down*, wait past the sync interval, confirm no sync
  activity occurs, then toggle it off and confirm the next sync runs normally.

### Caveats

- All fault state lives in memory only (`features/debug/services/fault-injector.ts`) and resets
  to defaults on app restart — it will never persist across a build handed to someone else.
- Peer discovery (`ZeroconfAdapter`) is **not** covered by the Network section's fault sliders;
  simulating discovery partition/timeout is a separate debug feature.
- These sections are a strict no-op when `IS_DEBUG_ENABLED` is false — there is no way to
  trigger any of this in a production build.

## Running Tests

```bash
# Run all tests
npm test

# Run a single file
npx jest path/to/test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="pattern"

# Run with coverage
npx jest --coverage
```

Test timeout: **10 seconds** per test (configured in `package.json`).

---

## What Is Mocked

Global mocks are set up in `jest-setup.js`. These run before every test file.

| Module | Why mocked |
|---|---|
| `@nozbe/watermelondb` | No SQLite in test environment |
| `react-native-webrtc` | Native module — not available in Jest |
| `react-native-tcp-socket` | Native module |
| `react-native-zeroconf` | Native module. Mock publication should emit a matching `published` event before the publish promise resolves. |
| `expo-background-task` | Native module |
| `expo-notifications` | Native module |
| `expo-task-manager` | Native module |
| `react-native-incall-manager` | Native module |
| `react-native-paper` | Avoids rendering native UI in unit tests |
| `expo-router` | Avoids navigation setup in unit tests |
| `axios` | Prevents real HTTP calls in unit tests |
| `lottie-react-native` | Native animation module |

---

## Test Utilities

Located in `test/`.

### Builders — `test/builders/factory.builder.ts`

A base `FactoryBuilder` class used by all factories. Provides a fluent API for constructing test objects with overrides.

### Factories — `test/factories/`

| Factory | Creates |
|---|---|
| `ApiResponseFactory` | Axios-style `{ data, status }` response objects |
| `AuthFormFactory` | `RegisterFormState`, `LoginApiRequest` objects |
| `ChatFactory` | `DataChatMessageI` message objects |
| `PeerServiceFactory` | Mock `PeerService` instances |
| `UserFactory` | User profile objects |

### Mocks — `test/mocks/`

| Mock | Provides |
|---|---|
| `AdapterMockBuilder` | Mock `TcpServerAdapter`, `TcpClientAdapter`, `WsSignalingAdapter`, `WebrtcAdapter`, `ZeroconfAdapter`. For Zeroconf publish tests, wire `published` and `error` events so the publish promise can resolve or reject deterministically. |
| `ApiMockBuilder` | Mocked axios calls for API endpoints |
| `AuthMockBuilder` | `SessionStore`, `UserStore` mocks |
| `ServiceMockBuilder` | `ConnectionService`, `SignalingService`, `WebrtcSessionManager`, `CallMediaService` mocks |
| `DatabaseMockBuilder` | WatermelonDB `database` mock |
| `UserServiceMockBuilder` | `UserService` mock |

---

## Writing a Service Test

### Pattern used across the codebase

```typescript
import { AdapterMockBuilder } from "@/test/mocks/adapter-mock-builder";
import { ServiceMockBuilder } from "@/test/mocks/service-mock-builder";

describe("MyService", () => {
  let service: MyService;
  let mockDep: ReturnType<typeof ServiceMockBuilder.buildConnectionService>;

  beforeEach(() => {
    mockDep = ServiceMockBuilder.buildConnectionService();
    service = new MyService(mockDep);
  });

  it("does something", () => {
    jest.spyOn(mockDep, "someMethod").mockReturnValue(true);
    service.doThing();
    expect(mockDep.someMethod).toHaveBeenCalled();
  });
});
```

> **Note:** `ConnectionService` callbacks use closures (not `.bind()`), so `jest.spyOn` replacements on the instance are respected correctly.

---

## Test File Locations

Tests live in `__tests__/` folders alongside the source they test:

```
features/shared/
  adapters/__tests__/
  api/__tests__/
  hooks/use-ping.test.ts
  stores/__tests__/
  services/__tests__/
config/__tests__/
```

---

## Path Alias

`@/` maps to the project root. Use it in tests the same as in source:

```typescript
import { ConnectionService } from "@/features/shared/services/connection-service";
```
