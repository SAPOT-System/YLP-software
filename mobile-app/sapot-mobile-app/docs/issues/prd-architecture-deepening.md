# PRD: Core Service Architecture Deepening

**Status:** In progress  
**Label:** ready-for-agent, refactor, architecture  
**Scope:** features/shared/, features/chat/

## Progress

### Completed

**1. WsMessageParser** (commit `da339bce1`)
- Extracted `parseWsMessage(raw, decrypt?)` → `features/shared/adapters/ws-message-parser.ts`
- Returns `WsEvent` discriminated union (signaling, call, chat, sms, ack, server-ack, public-chat, active-users, pong, ping, unknown)
- `WsSignalingAdapter.handleIncomingMessage` replaced with single `parseWsMessage` call + switch
- 17 tests added; SMS-vs-chat ordering, encrypted/decrypted signaling, malformed JSON all covered

**2. ConversationKeyStore** (commit `0789f8064`)
- Extracted `ConversationKeyStore` → `features/chat/repositories/conversation-key-store.ts`
- Owns: current key per conversation, bounded history (max 5, deduped), migration guest key snapshot, key-change listeners
- `MessageRepository` receives it via constructor; internal key-map reads route through it; thin delegate methods kept for existing callers (SyncService, chat-list, message-list, GuestMigrationService)
- `ChatService` calls `conversationKeyStore.setConversationKey()` directly
- `MainContainer` constructs `ConversationKeyStore` before `MessageRepository` and `ChatService`, wires key lifecycle calls
- 16 new unit tests; all 419 affected tests pass; typecheck clean

**3. NotificationService** (commit `a4750154d`)
- Extracted `NotificationService` → `features/shared/services/notification-service.ts`
- Exposes: `showCallAlert(data: IncomingCallData)` and `dismissCallAlert()`
- Owns: `incomingCallNotifId` state, expo-notifications import
- `ConnectionService` receives it via constructor injection; `dismissIncomingCallNotification()` delegates to it
- `expo-notifications` import removed from `connection-service.ts`
- `MainContainer` constructs `NotificationService` before `ConnectionService`
- 7 unit tests added; typecheck clean

**4. CallMessageRouter** (commit `4df4af442`)
- Extracted `CallMessageRouter` → `features/shared/services/call-message-router.ts`
- Stateless class; deps: `isBusyFor`, `hasActiveCall`, `notify` (all closures)
- Returns `CallRouterResult` discriminated union: `emit | busy-reject | glare | noop`
- `glare` result carries `eventName + eventPayload` so `ConnectionService.dispatchCallResult()` needs no re-read of the original message
- Two ~100-line duplicate call dispatch blocks (WS + TCP) replaced with 3-line delegations
- 14 unit tests; typecheck clean; `connection-service.test.ts` now passes

**5. MainContainer.initialize() phases** (commit pending)
- Extracted three private phases: `initializeKeys()`, `handleMigration()`, `startNetworkServices()`
- Branded token types `KeysReady` / `MigrationOk` enforce phase ordering at compile time
- `handleMigration()` carries `migrationPushPending` flag through to `startNetworkServices()`
- 9 unit tests in `features/shared/__tests__/main-container-initialize.test.ts`; typecheck clean

### Remaining (recommended order)
6. ChatService partial — saveCallLogWithReceipts + ConversationKeyManager

---

## Problem Statement

The core services of the mobile app have grown wide and mixed unrelated concerns together. Developers changing call handling must update two near-identical code blocks and hope they stay in sync. Adding a new WebSocket message type requires editing an 866-line adapter with no tests. Testing key-rotation logic requires setting up a full WatermelonDB database even though the logic is purely in-memory. Push notification content lives inside a networking class. The result is: bugs hide in untested critical paths, changes require touching multiple unrelated concerns, and the test setup cost for the largest services is high enough that new tests often go unwritten.

---

## Solution

Extract six shallow modules into deep, focused ones — moving behaviour behind narrower interfaces so that each concern has a single home, the critical paths have test coverage, and future changes are localized. The work is ordered so each step is independent and does not block the others, except where noted.

---

## User Stories

1. As a developer adding a new call message type (e.g. screen-share), I want to edit one file and add one test, so that I do not have to maintain two identical dispatch blocks and risk them diverging.

2. As a developer who changes the busy-reject logic for incoming calls, I want a unit test that proves the logic without setting up a WebSocket or TCP socket, so that I can be confident the change is correct before running on-device.

3. As a developer adding a new WebSocket message type from the server, I want to add one branch to a pure parsing function and write a unit test against it, so that I do not accidentally break the order-dependent type dispatch that routes chat vs SMS messages.

4. As a developer reading the WS adapter, I want the transport lifecycle (connect, reconnect, heartbeat) to be visually separated from message classification, so that I can find the relevant code without scanning 866 lines.

5. As a developer writing a test for key rotation, I want to instantiate a ConversationKeyStore in isolation without constructing a WatermelonDB database, so that the test is fast and free of infrastructure setup.

6. As a developer auditing encryption correctness, I want the in-memory key lifecycle (current key, key history, migration snapshot) to live in a single class separate from SQL CRUD, so that the crypto state machine is visible and reviewable in one place.

7. As a developer changing the incoming call notification (adding a caller avatar, a deep link, or a custom sound), I want to edit a NotificationService file, not a 1,400-line networking class, so that the change is safe and easy to find.

8. As a developer writing tests for ConnectionService, I want expo-notifications to not be part of the mock surface, so that the test setup is smaller and the tests are faster.

9. As a developer reading MainContainer.initialize(), I want the five initialization phases to be named private methods with typed precondition tokens, so that I can understand the startup sequence at a glance and cannot accidentally reorder phases.

10. As a developer debugging a crash-recovery failure during guest-to-auth migration, I want the migration recovery logic to live in a dedicated, independently testable function, so that I can write a regression test for the failure without bootstrapping the full container.

11. As a developer moving call-log writing out of ChatService, I want saveCallLogWithReceipts to live in CallService where it semantically belongs, so that ChatService is not responsible for a concern it does not own.

12. As a developer adding a new encryption key management method, I want the key management cluster to be separated from the message send/receive cluster in ChatService, so that changes to key handling do not require reading through send/receive logic.

13. As a reviewer auditing the call glare resolution logic, I want it to live in one place (CallMessageRouter), so that the audit is complete after reading one class rather than two near-identical constructor blocks.

14. As a developer adding a second transport (e.g. Bluetooth Low Energy), I want to plug it into CallMessageRouter rather than copying the call-dispatch block a third time, so that the transport is a configuration concern, not a copy-paste concern.

15. As a developer writing an end-to-end test for WebSocket message delivery, I want to inject a parsed WsEvent rather than a raw WebSocket string, so that the test exercises the application logic without mocking the network.

16. As a developer debugging a silent message loss bug in server mode, I want to quickly find the WS message parser and add a test that reproduces the dispatch failure, so that the fix is verifiable without a full server setup.

17. As a developer reviewing the WS adapter, I want ICE candidate buffering to be clearly a consequence of a parsed credential event (not an interleaved concern in the parse chain), so that the sequencing is explicit.

18. As a developer onboarding to the encryption architecture, I want the conversation key lifecycle (set, history, migration snapshot) documented via the ConversationKeyStore interface, so that I understand the invariants without reading MessageRepository CRUD code.

19. As a developer running the test suite, I want the three critical untested modules (WsSignalingAdapter message parser, LocalEncryptionService, PeerKeyService) to have baseline test coverage, so that CI catches regressions before they reach devices.

20. As a developer debugging a test failure in ConnectionService tests, I want the mock surface to be smaller (no expo-notifications, no call-media pass-throughs), so that the failure points to real logic rather than mock wiring.

---

## Implementation Decisions

### 1. WsMessageParser — extract from WsSignalingAdapter

A pure function `parseWsMessage(raw: string, decrypt?: DecryptFn): WsEvent` is extracted from `WsSignalingAdapter.handleIncomingMessage()`.

The return type is a discriminated union:

```typescript
// (from prototype — encodes the type-level decision)
type WsEvent =
  | { kind: 'signaling'; message: SignalingMessage; peerCredential?: SignedCredential }
  | { kind: 'call'; message: CallMessage }
  | { kind: 'chat'; message: ChatMessage }
  | { kind: 'sms'; message: SmsMessage }
  | { kind: 'ack'; message: AckMessage }
  | { kind: 'server-ack'; message: ServerAckMessage }
  | { kind: 'public-chat'; message: SendPublicChatPayload }
  | { kind: 'active-users'; ids: string[] }
  | { kind: 'pong' }
  | { kind: 'unknown'; raw: unknown }
```

The `decrypt` callback receives the encrypted envelope and returns a decrypted `SignalingMessage | null`. The parser calls it when the type field is `offer/answer/ice-candidate` and an `enc` field is present. ICE buffering and `storePeerKey` side effects remain in the adapter, triggered by receiving a `signaling` event with a `peerCredential` — they are not part of parsing.

The order-dependent dispatch between `sms` and `chat` (both match `type === "chat"`) becomes an explicit type-narrowing rule tested in the parser's own test suite.

`WsSignalingAdapter.handleIncomingMessage()` is replaced with a single call to `parseWsMessage()` followed by a switch on the result's `kind`.

### 2. ConversationKeyStore — extract from MessageRepository

A new `ConversationKeyStore` class owns the in-memory key lifecycle: current key per conversation, bounded key history (max 5, newest-first, deduplicated), migration guest key snapshot, and key-change listeners.

Interface:

```typescript
// (from prototype — key decisions encoded here)
class ConversationKeyStore {
  setConversationKey(conversationId: string, key: Uint8Array): void
  getCandidateKeys(conversationId: string): Uint8Array[]   // current first
  onConversationKeySet(listener: (convId: string) => void): () => void
  clearConversationKeys(): void
  captureGuestKeysForMigration(): void
  hasMigrationKeys(): boolean
  tryDecryptWithMigrationKeys(content: string, convId: string): string | null
  clearMigrationKeys(): void
}
```

`MessageRepository` receives `ConversationKeyStore` via constructor injection and calls `keyStore.getCandidateKeys()` when decrypting stored messages. `ChatService` calls `keyStore.setConversationKey()` directly rather than going through the repository. `MainContainer` constructs `ConversationKeyStore` before both `MessageRepository` and `ChatService`, and passes it to each.

`reEncryptAfterMigration()` remains on `MessageRepository` (it touches both the DB collection and key state) but becomes a consumer of `ConversationKeyStore` rather than an owner of key maps.

### 3. CallMessageRouter — extract from ConnectionService constructor

A `CallMessageRouter` class handles the incoming-call decision tree (busy-reject, glare resolution, notification, event emission) for both WS and TCP transports via a single `handle(msg: CallMessage): CallRouterResult` method.

The router is stateless; its dependencies are provided via constructor injection:

```typescript
// (from prototype — encodes the dependency shape decision)
interface CallMessageRouterDeps {
  isBusyFor: (peerId: string) => boolean
  hasActiveCall: (peerId: string) => boolean
  notify: (data: IncomingCallData) => Promise<void>
}

type CallRouterResult =
  | { action: 'emit'; eventName: string; payload: unknown }
  | { action: 'busy-reject'; peerId: string; callType: 'audio' | 'video'; callId: string }
  | { action: 'glare'; peerId: string }
  | { action: 'noop' }
```

`glareAcceptedPeers` and `activeCallPeerId` remain on `ConnectionService`; the router accesses them via the `isBusyFor` and `hasActiveCall` callbacks. ConnectionService's two ~100-line constructor blocks (WS and TCP) are replaced by two ~3-line delegations to `router.handle(msg)`, followed by a switch on the result.

This is Option A (stateless router). Option B (router owns glare state) is deferred.

### 4. NotificationService — extract from ConnectionService

A `NotificationService` class owns push notification scheduling via expo-notifications. It exposes two methods: `showCallAlert(data)` and `dismissCallAlert()`. It holds the `incomingCallNotifId` state. `ConnectionService` receives it via constructor injection. The `expo-notifications` import is removed from `connection-service.ts`.

This service is placed in `features/shared/services/` following the existing service placement pattern. It has no constructor dependencies (it owns the expo-notifications import directly).

### 5. MainContainer.initialize() — decompose into named phases

The 272-line `initialize()` body is split into three private methods:

```typescript
// (from prototype — encodes the ordering-enforcement decision)
type KeysReady = { readonly _brand: 'KeysReady' }
type MigrationOk = { readonly _brand: 'MigrationOk' }

private async initializeKeys(): Promise<KeysReady>
private async handleMigration(keys: KeysReady): Promise<MigrationOk>
private async startNetworkServices(migOk: MigrationOk): Promise<void>
```

The branded token types make phase ordering a TypeScript compile-time constraint. The public `initialize()` becomes a three-line sequential call. The post-construction setters are not addressed in this iteration.

### 6. ChatService — partial decomposition (two targets only)

**saveCallLogWithReceipts** moves from `ChatService` to `CallService`. It writes call records and receipt rows and has no dependency on the chat message send/receive or ACK state.

**Key preload cluster** (`preloadAllConversationKeys`, `rederiveKeyForPeer`) moves to a `ConversationKeyManager` utility after `ConversationKeyStore` is extracted (depends on Decision 2). This cluster wraps `PeerKeyService` and `ConversationKeyStore`.

The Send, AckTracker, and ConversationManager clusters remain in `ChatService` — their shared state reflects real coupling, not incidental coupling.

---

## Testing Decisions

### What makes a good test in this codebase

Test external behaviour through the module's public interface. Do not assert on internal state (private maps, internal fields). Do not test that a method was called — test that the observable result is correct. Use the Arrange-Act-Assert pattern established in the existing test suite (`test/`).

Prefer real objects over mocks where the real object is cheap (e.g. `ConversationKeyStore` instantiated directly). Use the existing `createFactory` builder pattern in `test/builders/factory.builder.ts` and mock builders in `test/mocks/service.mock-builders.ts`.

### Modules with new test coverage

**WsMessageParser** — one test file covering each `WsEvent` kind:
- SMS vs direct-chat ordering correctness (both match `type === "chat"`, SMS must win)
- Malformed JSON → `{ kind: 'unknown' }`, not a throw
- Encrypted envelope with `enc` field: decrypted result is classified by decrypted type
- Pong control message produces `{ kind: 'pong' }` and is not routed further
- Active-users array (bare JSON array) detected correctly

Prior art: `webrtc-adapter.test.ts` for adapter-level pure function testing.

**ConversationKeyStore** — one test file covering:
- Key history cap at MAX_KEY_HISTORY (5) entries
- Deduplication: setting the same key twice does not grow the history
- Migration snapshot isolation: `clearConversationKeys()` does not clear `migrationGuestKeys`
- `tryDecryptWithMigrationKeys` round-trip: encrypt with a captured guest key, decrypt successfully
- Listener subscription and unsubscription

Prior art: none (new class). Use `createFactory` pattern for building test `Uint8Array` key bytes.

**CallMessageRouter** — one test file covering:
- Busy-reject result when `isBusyFor` returns true for audio-call
- Busy-reject result when `isBusyFor` returns true for video-call
- Glare result when `hasActiveCall` returns true for incoming caller
- Emit result for call-ended, call-ready, call-rejected messages
- Noop for unrecognized message type

Prior art: extend `test/mocks/service.mock-builders.ts` with a `CallMessageRouterDeps` mock builder.

**NotificationService** — one test file covering:
- `showCallAlert` passes correct channel ID, sound, and data payload to the mocked expo-notifications
- `dismissCallAlert` is a no-op when no alert has been shown (no notifId)
- `dismissCallAlert` dismisses the stored notifId after `showCallAlert`

Prior art: `jest-setup.js` already mocks `expo-notifications` globally.

**MainContainer initialize phases** — one test file per phase:
- `initializeKeys()` clears pending credentials after init and returns a `KeysReady` token (mock `LocalEncryptionService`)
- `handleMigration()` does not call `reEncryptAfterMigration()` when `hasMigrationKeys()` is false
- `handleMigration()` calls `reEncryptAfterMigration()` then `clearMigrationState()` when migration state is `in_progress`

Prior art: no existing `MainContainer` tests. New file follows the minimal-mock builder pattern.

### Modules that do not need new tests

- `MessageRepository` CRUD methods — already tested; `ConversationKeyStore` extraction does not change observable behavior.
- `WsSignalingAdapter` connection lifecycle — unrelated to the parser extraction; existing behavior is preserved.

---

## Out of Scope

- Full ChatService decomposition (Send, AckTracker, ConversationManager are entangled — requires separate planning)
- Post-construction setter removal (ConnectionService/ChatService circular dependency — larger refactor)
- LocalEncryptionService and PeerKeyService test coverage (requires significant mock infrastructure for SecureStore and server API)
- WsSignalingAdapter connection lifecycle refactor (backoff, heartbeat, reconnect — not addressed)
- CallMessageRouter Option B (stateful router owning glare state) — deferred
- use-peer-list-data reactive hook (direct WatermelonDB observe calls — requires reactive repository abstraction)
- Any user-visible behaviour changes — all six changes are internal refactors

---

## Further Notes

Execution order that avoids interference between changes: WsMessageParser → ConversationKeyStore → NotificationService → CallMessageRouter → MainContainer phases → ChatService partial. Each is independent except the ChatService ConversationKeyManager cluster, which depends on ConversationKeyStore being extracted first.

All six changes are refactors. The Definition of Done for each issue: `npm run typecheck` passes, `npm test` passes for the affected areas, no new file exceeds 800 lines, no new function exceeds ~50 lines, and the relevant `docs/` file is updated per the doc-sync list in CLAUDE.md.
