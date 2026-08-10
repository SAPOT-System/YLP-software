# Conventions

## TypeScript

### Type vs. Interface

- `interface` for object shapes that may be extended or implemented
- `type` for unions, intersections, and utility types

```typescript
// object shape → interface
interface PageLoaderProps {
  skeleton?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// union → type
export type AppMode     = "auto" | "server" | "lan";
export type ErrorDomain = "network" | "auth" | "database" | "crypto" | "media" | "gps" | "signaling" | "sync" | "unknown";
export type ErrorSeverity = "low" | "medium" | "high" | "critical";
```

### `any` and `unknown`

- `any` is banned except in test mocks. Test mocks that use `any` must include an inline `// eslint-disable` justification.
- `unknown` is correct at trust boundaries (catch clauses, JSON parsing, external API responses). Narrow it before use; do not use `unknown` to avoid typing a value whose shape is already known.

### Generics

```typescript
export type FactoryOverrides<T> = Partial<T>;
export type Factory<T> = (overrides?: FactoryOverrides<T>) => T;
```

---

## Naming

| Concept | Convention | Example |
|---------|-----------|---------|
| Components | `PascalCase` | `CallBanner`, `PageLoader` |
| Hooks | `camelCase` + `use` prefix | `useCallService`, `useThrottledPress` |
| Services / repositories | `camelCase` filename, `PascalCase` class | `chat-service.ts`, `class ChatService` |
| Types / interfaces | `PascalCase` | `ErrorDomain`, `FactoryOverrides<T>` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_KEY_HISTORY`, `MAX_RECONNECT_RETRIES` |
| Booleans | `is`, `has`, `should`, or `can` prefix | `isGuest`, `hasEmail`, `shouldWarn` |
| Enums | `PascalCase` with string literal values | `MessageType.TEXT = "text"` |

---

## Enums vs. String Literal Unions

Two patterns exist. No formal rule is stated.

**Observed practice:**
- `enum` is used for values stored in WatermelonDB (schema-backed, serialized to DB):
  ```typescript
  export enum MessageType { TEXT = "text", FILE = "file", CALL_LOG = "call_log" }
  export enum CallStatus  { ACTIVE = "active", ENDED = "ended", MISSED = "missed" }
  ```
- `type` alias union is used for app-level states (never written to DB):
  ```typescript
  export type AppMode     = "auto" | "server" | "lan";
  export type ErrorDomain = "network" | "auth" | "database" | ...;
  ```

TODO: the enum-vs-union distinction is not documented. A new value's classification is ambiguous without checking whether it will be persisted to WatermelonDB.

---

## File & Folder Organization

```
features/<name>/
  services/       — Business logic
  repositories/   — WatermelonDB data access
  hooks/          — React hooks consuming services/stores
  components/     — UI components
  context/        — Optional feature-level React context
  types.ts
  index.ts        — Public API (re-exports only)
```

- Preferred file size: 200–400 lines; hard limit: 800 lines
- Preferred function size: ~50 lines

---

## Error Handling

### AppError

All errors are wrapped in `AppError` (`features/shared/core/errors/app-error.ts`) before being logged or rethrown:

```typescript
export class AppError extends Error {
  readonly domain: ErrorDomain;
  readonly severity: ErrorSeverity;
  readonly cause?: unknown;
}
```

### Standard Catch Pattern

```typescript
catch (error) {
  const appErr = toAppError(error, "database");
  log.error("operation failed", { ...appErr });
  captureAppError(appErr); // → Sentry
  throw appErr;
}
```

### Background Task Exception

Background tasks (SyncService, `MainContainer.initialize()`) catch errors and **continue** rather than rethrow — non-fatal, retried on the next cycle.

---

## Immutability

Never mutate existing objects in place. Always create new objects.

- Spread for state updates
- WatermelonDB writes use the framework's callback form (never direct assignment outside a write block)
- Key maps use `.set()` with a new array; never `.push()` on the existing reference

```typescript
// key history rotation (message-repository.ts)
const deduped = history.filter((k) => !keysEqual(k, sharedKey));
deduped.unshift(sharedKey);
if (deduped.length > MAX_KEY_HISTORY) deduped.length = MAX_KEY_HISTORY;
this.conversationKeyHistory.set(conversationId, deduped);
```

---

## Reactive Stores

Stores expose `subscribe(listener)` and return an unsubscribe function:

```typescript
subscribe(listener: AppModeListener) {
  this.listeners.add(listener);
  return () => this.listeners.delete(listener);
}
```

`ConnectionService` uses `TypedEventEmitter<ConnectionServiceEvents>` for async cross-service events with full type safety.

---

## Lazy Initialization / Idempotency

Services that must initialize async use an `initPromise` guard:

```typescript
async initialize() {
  if (this.initPromise) return this.initPromise;
  this.initPromise = (async () => { /* ... */ })();
  return this.initPromise;
}
```

---

## `useXService` Hooks vs. Direct Container Access

Two patterns are used interchangeably. No stated preference.

```typescript
// delegation hook pattern
export function useCallService() {
  return useMainContainer().callService;
}

// direct destructure pattern
const { chatService, messageRepository } = useMainContainer();
```

TODO: no rule distinguishes when to write a delegation hook vs. accessing the container directly.

---

## Data Transformation Responsibility

No hard rule, but observed split:

- **Services** handle business logic: encryption, persistence, receipt tracking, key derivation
- **Hooks** handle UI-specific concerns: query filtering, formatting, combining with local state

---

## Logging

Scope-based instances per module:

```typescript
const connectionLog = logger.createLogger({ scope: "connection" });
const chatLog       = logger.createLogger({ scope: "chat" });
```

Runtime filter: `EXPO_PUBLIC_ENABLED_LOG_MODULES=connection,network,background`

Unset = all scopes enabled. File logging is always on in production; opt-in in dev via `EXPO_PUBLIC_LOG_TO_FILE=1`. Laptop collector runs via `pnpm run log-server` in dev.

---

## Testing

### Structure

AAA pattern (Arrange-Act-Assert):

```typescript
it("returns user after setUser", () => {
  const store = new UserStore();                              // Arrange
  const user  = createTestPeer({ id: "user-1" }) as never;

  store.setUser(user, false);                                // Act

  expect(store.user).toBe(user);                             // Assert
});
```

### Factories

```typescript
// test/builders/factory.builder.ts
export function createFactory<T>(defaults: T | (() => T)): Factory<T>
export function createFactoryList<T>(factory, count, overrides): T[]
```

Global mocks (WatermelonDB, WebRTC, TCP, Zeroconf, Expo modules, react-native-paper) are configured in `jest-setup.js`. Real `axios` error types are preserved so error-handling tests can check `isAxiosError`.

Path alias `@/` maps to the project root.

There are ~130 test files across `features/`, `config/`, `components/` and `app/`.

**No coverage threshold is enforced.** `.github/workflows/expo-android-ci.yml` runs `pnpm run
lint`, `pnpm run --if-present typecheck`, `pnpm test -- --runInBand --forceExit` and
`expo-doctor` — none of them with `--coverage`. A green CI run therefore says nothing about the
80 % figure in the repo-wide guidance. Measure it deliberately with `npx jest --coverage` when it
matters.
