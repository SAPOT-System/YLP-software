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

## E2E Tests (Maestro)

Flows live in `.maestro/` (`calls-voice-flow.yaml`, `calls-video-flow.yaml`, `gps-stream-flow.yaml`). They drive the real app via [Maestro](https://maestro.mobile.dev) against a running Android emulator/device — install the Maestro CLI first (`curl -Ls "https://get.maestro.mobile.dev" | bash`).

Calls and GPS streaming are two-party flows, so most scenarios need **two simulators/emulators** running the dev build (`npm run android`) simultaneously, each signed in as a different user:

1. Boot two Android emulators (or one emulator + one physical device), e.g. `emulator -avd <name1>` and `emulator -avd <name2>`.
2. Install and launch the dev build on both (`npm run android` targets whichever device `adb` currently sees; use `adb -s <serial> ...`/`ANDROID_SERIAL` to target a specific one, or `expo run:android --device` to pick interactively).
3. Sign in as a different user on each device — for calls, both must already be paired peers; for GPS, the streamer must be a regular user and the viewer a rescuer account.
4. Run a single flow against the initiating/streaming device:
   ```bash
   maestro test .maestro/calls-voice-flow.yaml   # or calls-video-flow.yaml / gps-stream-flow.yaml
   ```
   Target a specific device with `maestro --device <serial> test .maestro/<flow>.yaml` if more than one is connected.
5. On the second device, perform the manual peer step called out in the flow's header comment (accept the incoming call, or open the "Map" tab to confirm the streamer's marker appears).

Run everything in `.maestro/` with `npm run e2e`.

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
