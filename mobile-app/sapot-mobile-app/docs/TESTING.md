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

> **The app speaks HTTPS in every build variant, development included.** `getApiUrl()`/`getWsUrl()`
> return `https://`/`wss://` with no port and no plaintext fallback, so a bare
> `uvicorn --port 8000` server is **not** reachable from the app — the connection fails before any
> request is made.

Use one of the two supported paths:

- **Docker (recommended)** — the Nginx TLS terminator in
  [`docs/getting-started/docker-setup.md`](../../../docs/getting-started/docker-setup.md) handles
  certificates for you.
- **Bare metal** — follow "Configure TLS trust for local development" in
  [`docs/getting-started/mobile-app-setup.md`](../../../docs/getting-started/mobile-app-setup.md#configure-tls-trust-for-local-development)
  *before* starting the server. The dev build trusts either a CA in the device's user store or a
  leaf signed by the bundled `server_ca.pem`.

Leave the server running while you test the mobile app.

## Manual App Setup

1. Open the getting-started screen.
2. Tap Server Mode, then tap the settings icon.
3. Enter your laptop's LAN IP address (host only — no scheme, no port) and save.

This sets the persisted host override (`setRuntimeHostOverride`), which takes precedence over both
`EXPO_PUBLIC_DEV_HOST` and the EAS-channel default. The app will address it as
`https://<what-you-entered>`.

## Running Tests

```bash
# Run all tests
pnpm test

# Run a single file
npx jest path/to/test.ts

# Run tests matching a name pattern
npx jest --testNamePattern="pattern"

# Run with coverage
npx jest --coverage
```

### Full quality gate

Before reporting a change complete, run the same checks CI does:

```bash
pnpm run testAll   # test + typecheck + lint + expo-doctor
```

Or individually, when you only need one:

```bash
pnpm test
pnpm run typecheck   # tsc --noEmit
pnpm run lint        # eslint . --ext .js,.jsx,.ts,.tsx
```

> `testAll` is defined in `package.json` as a chain of `npm run …` calls. It works under pnpm, but
> the inner commands invoke npm — don't read it as a recommendation to use npm here.

### Jest configuration

Configured under the `jest` key in `package.json`, not a separate config file:

| Setting | Value |
|---|---|
| `preset` | `jest-expo` |
| `setupFilesAfterEnv` | `jest-setup.js` — the global mocks below |
| `moduleNameMapper` | `^@/(.*)$` → `<rootDir>/$1` |
| `testTimeout` | 10 000 ms per test |
| `testPathIgnorePatterns` | `/node_modules/`, `/__tests__/_` |

---

## What Is Mocked

Global mocks are set up in `jest-setup.js`. These run before every test file.

| Module | Why mocked |
|---|---|
| `@nozbe/watermelondb` | No SQLite in test environment |
| `@nozbe/watermelondb/adapters/sqlite` | Same — the adapter is mocked separately from the core |
| `@nozbe/watermelondb/react` | Observable HOCs would need a live database |
| `react-native-webrtc` | Native module — not available in Jest |
| `react-native-tcp-socket` | Native module |
| `react-native-zeroconf` | Native module. Mock publication should emit a matching `published` event before the publish promise resolves. |
| `react-native-incall-manager` | Native module |
| `react-native-quick-crypto` | Native crypto bindings |
| `react-native-quick-base64` | Native bindings |
| `react-native-reanimated` | Native animation driver |
| `react-native-background-actions` | Native module |
| `lottie-react-native` | Native animation module |
| `expo-background-task` | Native module |
| `expo-task-manager` | Native module |
| `expo-notifications` | Native module |
| `expo-file-system` | Touches the real filesystem (log files) |
| `@react-native-documents/picker` | Native file picker |
| `react-native-paper` | Avoids rendering native UI in unit tests |
| `expo-router` | Avoids navigation setup in unit tests |
| `axios` | Prevents real HTTP calls in unit tests |
| `@sentry/react-native` | Prevents test runs reporting to Sentry |
| `reactotron-react-native` | Dev-only debugging client |

---

## Test Utilities

Located in `test/`. Everything here is **plain functions** — there are no builder classes.

### Factory helper — `test/builders/factory.builder.ts`

Two generic helpers the factories are built from:

| Export | Purpose |
|---|---|
| `createFactory<T>(defaults)` | Returns a `(overrides?) => T` function. `defaults` may be a value or a thunk — use a thunk when the defaults contain mutable objects or fresh ids. |
| `createFactoryList<T>(factory, count, overrides?)` | Builds an array. `overrides` may be an object, or `(index) => overrides` to vary each item. |

Overrides are a shallow `{ ...base, ...overrides }` merge — nested objects are replaced, not merged.

### Factories — `test/factories/`

| File | Exports |
|---|---|
| `chat-model.factory.ts` | `createTestMessage`, `createTestMessages`, `createTestConversation`, `createTestConversationParticipant`, `createTestMessageStatus`, `createTestUnsentStatus` |
| `peer-service.factory.ts` | `createTestPeer`, `createTestPeers`, `createTestDiscoveredService(s)`, `createTestZeroconfService` |
| `user.factory.ts` | `createTestGuestUser`, `createTestUserProfileResponse` |
| `auth-form-state.factory.ts` | `createRegisterFormState`, `createRegisterFormStateErrors` |
| `api-response.factory.ts` | `createTestPingResponse` |
| `destroy-op.factory.ts` | `createDestroyOp`, `createDestroyOps` |

### Mocks — `test/mocks/`

| File | Exports |
|---|---|
| `adapter.mock-builders.ts` | `createMockTcpServer`, `createMockTcpClientSocket`, `createMockServerSocket`, `createMockRtcPeerConnection`, `createMockMediaStream`, `createMockMediaTrack` |
| `service.mock-builders.ts` | `createConnectionServiceDependencyMocks`, `createChatServiceDependencyMocks`, `createCallServiceDependencyMocks`, `createDiscoveryServiceDependencyMocks` |
| `api.mock-builders.ts` | `createMockAxiosInstance`, `createMockInterceptorUse` |
| `auth-component.mock-builders.ts` | `createUserStoreMock`, `createSessionStoreMock`, `createPeerServiceMock`, `createPeerRepositoryMock`, `createGuestUserRepositoryMock`, `createRegisterCallbacks`, `createRegisterNavigationMock` |
| `auth-container-context.mock.tsx` | `createUserContainerValue`, `createUserContainerWrapper` |
| `database.mock-builders.ts` | `createWatermelonDbMock`, `createCollectionMock`, `createUpdatableRecord`, `createDestroyableRecord` |
| `clean-up-service.mock-builders.ts` | `createCleanUpServiceMock`, `createCleanUpRepositoriesMocks` |

Each `*.mock-builders.ts` also exports matching `*Mock` types (`UserStoreMock`, `TcpServerMock`, …) for typing the `let` declarations in a `describe` block.

---

## Writing a Service Test

The dominant pattern is `jest.mock()` for the module boundary plus a
`create*DependencyMocks()` helper for the constructor arguments:

```typescript
import { createDiscoveryServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import { DiscoveryService } from "../discovery-service";

jest.mock("../../adapters", () => ({ ZeroconfAdapter: jest.fn() }));

describe("DiscoveryService", () => {
  let service: DiscoveryService;
  let mocks: ReturnType<typeof createDiscoveryServiceDependencyMocks>;

  beforeEach(() => {
    mocks = createDiscoveryServiceDependencyMocks();
    service = new DiscoveryService(/* ...mocks, in constructor order */);
  });

  it("publishes the local service", async () => {
    await service.publishDevice();
    expect(mocks.zeroconfAdapter.publishService).toHaveBeenCalled();
  });
});
```

`create*DependencyMocks()` returns a **named object** (`{ zeroconfAdapter, sessionStore,
networkConfig, userStore, peerService, chatService, ... }`), so assert against
`mocks.<dep>.<method>` rather than re-deriving the mock.

> **Note:** `ConnectionService` callbacks use closures (not `.bind()`), so `jest.spyOn` replacements on the instance are respected correctly.

For Zeroconf publish tests, wire the `published` and `error` events so the publish promise can
resolve or reject deterministically — `DiscoveryService` only marks the service active after
`ZeroconfAdapter` confirms publication.

---

## Test File Locations

Tests live in `__tests__/` folders alongside the source they test, with a few co-located
`*.test.ts` files (e.g. `features/shared/hooks/use-ping.test.ts`). Both are picked up.

```
features/<name>/<layer>/__tests__/     e.g. features/shared/connection/adapters/__tests__/
                                            features/chat/services/__tests__/
                                            features/auth/hooks/__tests__/
config/__tests__/
app/(drawer)/(tabs)/call/__tests__/    screens are tested too
```

**Files under `__tests__/` whose name starts with `_` are not collected** — `testPathIgnorePatterns`
includes `/__tests__/_`. Use that prefix for shared helpers that live beside the tests but are not
themselves test suites.

---

## Path Alias

`@/` maps to the project root. Use it in tests the same as in source:

```typescript
import { ConnectionService } from "@/features/shared/connection/services/connection-service";
```
