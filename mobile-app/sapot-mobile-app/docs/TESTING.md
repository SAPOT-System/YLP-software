# Testing Guide

## Tester Setup

Use this when you need to start the backend locally for manual testing.

1. Open a terminal.
2. Go to the `YLP-Software/` folder, then into `server/`.
3. Run the backend setup and server command:

```bash
source app/venv/bin/activate && pip install -r app/requirements.txt && source app/venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Leave that terminal running while you test the mobile app.

## Manual App Setup

1. Open the app and go to the getting-started screen with the mode options.
2. Select Server Mode on the mode-select card.
3. Tap the settings icon on the Server Mode card.
4. Enter your laptop's LAN IP address in the host field.
5. Save the setting, then continue into the app.

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
| `react-native-zeroconf` | Native module |
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
| `AdapterMockBuilder` | Mock `TcpServerAdapter`, `TcpClientAdapter`, `WsSignalingAdapter`, `WebrtcAdapter`, `ZeroconfAdapter` |
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
