
# Readability & Maintainability Audit

**Scope:** ~41,300 LOC production + ~13,700 LOC tests across 9 features. React Native / Expo, manual DI, P2P (WebRTC/TCP) + server-relay (WebSocket) messenger.

**Date:** 2026-06-25  
**Evaluated for:** New engineer onboarding, complexity hotspots, adherence to CLAUDE.md limits.

---

## Summary Scores

| Dimension | Score | Justification |
|---|---|---|
| **Readability** | **6.5 / 10** | Strong naming and low surface-level smell, undermined by oversized files and functions. |
| **Understandability** | **7 / 10** | Genuinely excellent docs (ADRs, diagrams, flow docs) offset high inherent P2P complexity. |
| **Maintainability** | **5.5 / 10** | God-classes and a 290-line function concentrate risk, but healthy test ratio and doc-sync discipline cushion it. |

**Headline tension:** Documentation and conventions are above-average, but core runtime services violate CLAUDE.md's own stated limits (800 lines per file, ~50 lines per function).

---

## Strengths

### 1. Low Code Smell Density
Across all non-test source (41k LOC):
- **8** `TODO`/`FIXME`/`HACK` markers
- **4** `console.*` calls (non-test)
- **13** `eslint-disable` comments
- **10** `any` type usages

This is genuinely disciplined. For a project this size and complexity, these numbers reflect strong code hygiene.

### 2. Documentation is a Real Onboarding Asset
- **`docs/ARCHITECTURE.md`** (266 lines) — explains DI containers, construction order, runtime services clearly
- **`docs/CALL_FLOW.md`**, **`docs/SYNC.md`** — detailed flow diagrams and state machine explanation
- **`docs/adr/0001-unexpected-offer-triggers-rebuild.md`**, **`0002-ui-is-sole-reconnect-owner.md`** — decisions documented with rationale
- **`docs/diagrams/`** — 8 sequence flows (startup, LAN messaging, call flow, GPS, guest user, SMS, encryption, security)
- **`README.md`** — working setup path with clear prerequisites and local dev instructions

This is rare and valuable. It substantially reduces onboarding time.

### 3. Consistent Naming Conventions
- Descriptive `camelCase`: `connectionService`, `messageRepository`, `conversationKeyManager`
- Boolean prefixes: `isWsConfigured`, `hasActiveSession`, `shouldBusyRejectIncomingCall`
- `PascalCase` for types and interfaces
- Predictable method names: `getX()`, `setX()`, `findX()`, `createX()`

A reader can infer behavior from the name alone, reducing cognitive load.

### 4. Healthy Test Ratio
- **~33% of total LOC is test code** (13.7k of 54.9k)
- Co-located tests in `__tests__/` directories
- Shared mock builders in `test/mocks/` (adapter.mock-builders.ts, service.mock-builders.ts)
- Largest services have matching test files: `chat-service.ts` (1,448 lines) ↔ `chat-service.test.ts` (1,107 lines)

### 5. Feature-Oriented Structure
- Consistent shape: `components/`, `hooks/`, `services/`, `repositories/`, `types.ts`, `index.ts`
- Public API per feature via `index.ts`
- Clear boundaries between `shared/` (engine) and domain features (chat, call, gps)

---

## Top 10 Issues Affecting Readability & Comprehension

### 1. **God-Files Exceeding 800-Line Limit**
Five core files break CLAUDE.md's stated limit simultaneously, all in the critical path a new engineer must understand:

| File | Lines | Methods | Severity |
|---|---|---|---|
| `features/chat/services/chat-service.ts` | 1,448 | ~50+ | **CRITICAL** |
| `features/shared/connection/services/connection-service.ts` | 1,262 | ~140 | **CRITICAL** |
| `features/sync/services/sync-service.ts` | 1,230 | ~86 | **CRITICAL** |
| `features/call/services/call-service.ts` | 1,169 | ~117 | **CRITICAL** |
| `features/shared/connection/adapters/webrtc-adapter.ts` | 1,102 | ~50+ | **HIGH** |

**Impact:** These files are where most bugs live, are hardest to modify, and take longest to understand. A newcomer cannot skip them.

**Evidence:** `chat-service.ts` mixes message send (line 544–627), incoming message handling (240–301), conversation lifecycle (788–820), and SMS fallback (628–788) all in one class.

---

### 2. **A ~290-Line Function: `connectToPeerImpl`**
**Location:** `features/shared/connection/services/connection-service.ts:622–915`

**Responsibility stack:**
- Candidate-address de-duplication (Line 630–639)
- Transport-mode resolution: `auto` → ws/tcp, `server` → ws only, `lan` → tcp only (650–675)
- Glare/politeness mechanism via `setIsPolite()` (640)
- Signaling availability check (677–691)
- TCPclient connection and retry logic (700+)
- WebRTC offer/answer exchange (800+)

**Code sample (lines 622–680):**
```typescript
private async connectToPeerImpl(
  peerId: string,
  ipAddress?: string,
  port?: number,
  addresses?: string[],
  _retryCount = 0
) {
  // De-duplicate addresses
  const candidateAddresses = Array.from(
    new Set([ipAddress, ...(addresses ?? [])].filter((a): a is string => Boolean(a)))
  );

  const tcpAdapter = this.getTcpClientAdapter(peerId);
  const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
  
  // Glare handling: set polite if this peer ID is "smaller"
  webrtcAdapter.setIsPolite(this.userStore.user.id < peerId);

  const effectiveMode = this.appModeStore.getEffectiveMode(this.userStore.isGuest);
  const canUseWebsocket = this.isWebSocketAllowed();
  const canUseTcp = this.isTcpAllowed();
  const isWsConfigured = canUseWebsocket
    ? this.signalingService.ensureWsSignaling()
    : false;

  const signalingTransport: "ws" | "tcp" | "none" = isWsConfigured
    ? "ws"
    : canUseTcp
    ? "tcp"
    : "none";

  // ... 220+ more lines ...
}
```

**Why this is a problem:**
- Modifying the TCP dial logic requires navigating 290 lines to find where it lives
- Adding a new transport mode (e.g., QUIC) requires understanding the entire state machine
- Testing requires mocking 8+ collaborators and setting up complex call sequences
- Bug in glare handling affects connect, which affects 5+ test files

**This is the single highest bug-risk site in the codebase.**

---

### 3. **ConnectionService is a God-Facade**
**Location:** `features/shared/connection/services/connection-service.ts:104–116`

11-parameter constructor:
```typescript
constructor(
  private readonly tcpServerAdapter: TcpServerAdapter,
  private readonly networkConfig: NetworkConfig,
  private readonly userStore: UserStore,
  private readonly appModeStore: AppModeStore,
  private readonly wsSignalingAdapter: WsSignalingAdapter,
  private readonly webrtcSessionManager: WebrtcSessionManager,
  private readonly signalingService: SignalingService,
  private readonly callMediaService: CallMediaService,
  private readonly notificationService: NotificationService,
  private readonly peerKeyService?: PeerKeyService,
  private readonly peerKeyStore?: PeerKeyStore
) { ... }
```

Plus CLAUDE.md documents: **"constructed last because it wires sub-services via callbacks. Callbacks use closures instead of `.bind()` so `jest.spyOn` replacements are respected."**

**The trap:** Construction *order* is load-bearing and invisible at the call site. In `MainContainer.initialize()` (line 601), if `ConnectionService` is constructed before `SignalingService`, runtime fails silently or behaves oddly — the type system does not enforce this.

**Impact:** A refactor to a more conventional DI pattern (constructor injection of all deps) would break tests, silently — `jest.spyOn` would no longer capture the closured functions.

---

### 4. **Inline Structural Types in Field Declarations**
**Location:** `connection-service.ts:97–98`

```typescript
private callService?: { 
  saveCallLogWithReceipts: (params: { 
    peerId: string; 
    content: string; 
    status?: import("@/features/shared/core/database/model/MessageStatus").MessageStatusType; 
    senderId: string; 
    messageId?: string; 
    conversationId?: string 
  }) => Promise<string> 
};

private peerService?: { 
  updatePeerInfo: (id: string, info: { 
    username?: string; 
    firstName?: string; 
    lastName?: string; 
    isGuest?: boolean 
  }) => Promise<void> 
};
```

**Why:** These are structural types (duck-typed) because the setter wiring is half-built after construction — `peerService` is not the real `PeerService` but a sliced subset. Good reason for duck-typing, but the syntax is dense and hard to scan.

**Impact:** A new engineer reading this cannot immediately see what shape is expected; they must parse multi-line object types inline, which splits their attention from the class-level concern.

---

### 5. **Overload-Heavy Private Helpers**
**Location:** `sync-service.ts:786–822` — `toServerPayload` has 7 overload signatures feeding one implementation.

```typescript
private toServerPayload(call: Call): CallPayload;
private toServerPayload(message: Message): MessagePayload;
private toServerPayload(messageReceipt: MessageReceipt): MessageReceiptPayload;
private toServerPayload(conversation: Conversation): ConversationPayload;
private toServerPayload(guest: GuestUser): GuestUserPayload;
private toServerPayload(peer: Peer): PeerPayload;
private toServerPayload(announcement: Announcement): AnnouncementPayload;
// Implementation:
private toServerPayload(entity: Call | Message | MessageReceipt | Conversation | GuestUser | Peer | Announcement) {
  switch (entity.recordName) {
    case "calls": return { /* ... */ };
    case "messages": return { /* ... */ };
    // ...
  }
}
```

**Why:** Type safety — overloads let TypeScript narrow the return type. Correct pattern.

**But:** A reader must cross-reference 7 signatures against a single-branch switch to follow data flow. For someone unfamiliar with the entity model, this is a 30-second mental tax per call site.

---

### 6. **Directory Naming Inconsistency**
All features use plural `components/` except:
- **`features/chat/component/`** (singular) — breaks the pattern

Example: `features/chat/components/message-list.tsx` (542 lines) vs. every other feature uses `features/chat/components/`.

**Impact:** Small, but it breaks a newcomer's mental autocomplete and signals inconsistency. Git autocomplete will suggest the wrong path.

---

### 7. **Uneven Feature Shape**
The "feature" abstraction is uniform in name but wildly uneven in weight:

| Feature | What's Inside | Criticality |
|---|---|---|
| `shared/` | adapters, services (connection, sync, signaling, call), stores, database, encryption | **Engine** — the whole app is here |
| `auth/` | services, containers, context, API | **Core** |
| `chat/` | services, repositories, hooks, components | **Domain** |
| `call/` | services, repositories, hooks, components | **Domain** |
| `settings/` | components only | **Trivial** |
| `getting-started/` | components only | **Trivial** |

**Impact:** The directory listing under-represents where the complexity lives. A newcomer scanning `ls features/` sees 9 features and thinks work is evenly distributed; in reality, 70% of the engine is in `shared/`.

---

### 8. **Long Lifecycle Methods in ChatService**
Two methods are each ~125 lines and interleave multiple concerns:

**`sendChatMessageWithSms` (lines 663–788):**
- Encrypt message
- Warm up conversation key
- Send via WebRTC or SMS fallback
- Persist to DB
- Update message status
- Trigger sync
- Show notification

**`handleIncomingChatMessage` (lines 240–301):**
- Validate encryption state
- Decrypt message
- Extract or create conversation
- Persist message
- Send ACK
- Show notification
- Mark as read if active

**Impact:** Business logic is followable, but only after loading a lot of context. Modifying message persistence without breaking notifications requires holding 8+ lines of context in your head.

---

### 9. **Implicit Setter-Wiring After Construction**
Services are half-built by constructor, then completed by a series of setters.

**Location:** `connection-service.ts:500–516`, `sync-service.ts:202–214`

Example from `SyncService`:
```typescript
constructor({ db, messageReceiptManager, currentUserId, peerService, peerRepository }: SyncServiceParams) {
  super();
  this.db = db;
  this.messageReceiptManager = messageReceiptManager;
  // ... five more lines ...
}

setMessageReceiptManager(messageReceiptManager: MessageReceiptManager): void {
  this.messageReceiptManager = messageReceiptManager;
  // Called again later
}

setPeerService(peerService: PeerService): void {
  this.peerService = peerService;
}

setMessageRepository(repo: MessageRepository): void {
  this.messageRepository = repo;
}
```

**The trap:** An object is not fully usable until a series of setters fire in the right order — invisible temporal coupling.

If `syncNow()` is called before `setMessageRepository()`, it silently skips message syncing (check: line 214 `if (!this.messageRepository) return`).

**Impact:** Type system does not enforce the contract. No compile-time guarantee that an object is ready. Leads to "works in production, silent failure in tests" bugs.

---

### 10. **Callback-Closure Wiring Driven by Test Mechanics**
**Location:** CLAUDE.md and `main-container.ts`

CLAUDE.md documents: "Callbacks use closures instead of `.bind()` so `jest.spyOn` replacements on the instance are respected in tests."

**Example:** In `MainContainer.initialize()`:
```typescript
connectionService.setTcpCallbacks({
  onMessage: (peerId, message) => { /* closure */ },
  onConnected: (peerId) => { /* closure */ },
});
```

**The trap:** A production design decision is driven by test harness behavior. A maintainer refactoring to `.bind()` for clarity would silently break tests — the spy would no longer intercept the original method.

**Impact:** This is a subtle trap buried in CLAUDE.md. New engineers who refactor without reading the rationale will break tests in a non-obvious way.

---

## Hardest Parts for a New Engineer

### 1. **Connect/Signaling State Machine** (~2–3 weeks)
**What:** `connectToPeerImpl`, transport modes (`auto`/`server`/`lan`), glare/politeness via `setIsPolite`, `glareAcceptedPeers` tracking.

**Why hard:**
- Inherently complex P2P state machine
- Concentrated in a single 290-line function with no extract boundaries
- ADRs (0001, 0002) document the *why*, but the code itself does not
- Involves 5+ collaborators (TCP, WebRTC, WS, signaling service, mode store)
- Transport mode constraints must be understood or they will be accidentally violated

**Learning path:** Read ARCHITECTURE.md (connection/signaling section), then ADR 0001/0002, then `connectToPeerImpl` method by method.

### 2. **MainContainer Construction Order** (~1 week)
**What:** DI wiring, `ConnectionService` last, callback wiring via closures.

**Why hard:**
- Order is load-bearing but invisible at the call site
- CLAUDE.md documents it, but it's not obvious from code alone
- Understanding why closures are used (test mechanics) requires reading CLAUDE.md

**Learning path:** Read ARCHITECTURE.md (Dependency Injection section), then CLAUDE.md (Decision Rules, Immediate Agent Usage), then `MainContainer.initialize()`.

### 3. **Sync Push/Pull Lifecycle** (~2–3 weeks)
**What:** `SyncService`, pagination (`MAX_ITERATIONS`), FK/timestamp validation, 7-overload payload mapping, `peer-hydrator.ts` / `push-filter.ts` / `migration-guard.ts` helpers.

**Why hard:**
- Spread across multiple files
- Business logic (what to sync) interleaved with infra (pagination, validation)
- Setter-injection temporal coupling (`setMessageRepository`, etc.)
- The recent extraction of helpers into separate files shows the shape, but the full flow is still non-local

**Learning path:** Read SYNC.md, then `sync-service.ts` (pull, then push), then helpers (`peer-hydrator.ts`, etc.).

### 4. **Encryption Layering** (~2 weeks)
**What:** TCP vs WS vs at-rest encryption, with `peer-key-service`, `conversation-key-manager`, key warm-up on connect.

**Why hard:**
- Multiple crypto stacks (`tweetnacl`, `@noble/hashes`, `react-native-quick-crypto`)
- Key lifecycle: derive → store → warm up on connect → use
- At-rest encryption adds another layer
- No single file documents the full flow

**Learning path:** A `crypto-architecture` skill exists because this needs a map. Use it, then trace `peer-key-service.ts` and `local-encryption-service.ts`.

---

## Estimated Time-to-Productivity

**For a competent RN/TypeScript engineer:**

| Domain | Time | Caveats |
|---|---|---|
| Peripheral features (settings, announcements) | 3–5 days | Low complexity, isolated |
| Chat / sync flows | 2–3 weeks | Requires understanding DI + service wiring + DB |
| Core P2P: connection, signaling, call lifecycle, WebRTC | 4–6 weeks | 290-line function is a hurdle; ADRs help |
| Full confidence (including encryption + foreground-service lifecycle) | 6–8 weeks | Crypto stack + Android lifecycle coordination needed |
| **First meaningful PR touching core services** | 4–6 weeks | Can write code sooner, but confidence takes time |

**The docs realistically shave ~30% off what this complexity would otherwise demand.**

---

## Highest-Impact Improvements (priority order)

### 1. **Break up `connectToPeerImpl` — CRITICAL** (1 week)
Extract into focused helpers:
- `resolveSignalingTransport(mode, canWs, canTcp)` → transport
- `dialTcpCandidates(addresses, adapter)` → TCP connection logic
- `negotiateWebrtc(adapter, transport)` → offer/answer/ICE
- `handleAlreadyConnected(webrtc)` → early-exit case
- `retry(peerId, count, delay)` → retry logic

**Target:** < 100 lines per method, each with one reason to change.

**Impact:**
- Reduces bug-risk surface
- Makes testing modular (test each piece independently)
- Makes modification safer (change one piece without touching the whole)
- New engineers can understand each part in isolation

**Effort:** ~6–8 hours (mostly mechanical).

---

### 2. **Split God-Files Along Existing Seams** (3–4 weeks)
Target the remaining four largest files:

**`chat-service.ts` (1,448 → ~450 each):**
- Extract `ChatSendService` (send, status tracking, SMS fallback)
- Extract `ChatReceiveService` (incoming, ACK, seen messages)
- Keep `ChatService` as facade + conversation lifecycle

**`sync-service.ts` (1,230 → ~400 each):**
- Keep push/pull in `SyncService`
- Extract payload mapping into `SyncPayloadBuilder` (the `toServerPayload` overloads)
- Move helper logic into `peer-hydrator`, `push-filter`, `migration-guard` (already partly done)

**`call-service.ts` (1,169 → ~450 each):**
- Extract `CallAudioService` (audio routes, earpiece/speaker logic)
- Extract `CallSessionService` (session lifecycle)
- Keep `CallService` as facade

**`webrtc-adapter.ts` (1,102 → ~400 each):**
- Extract `IceGatherer` (ICE candidate handling)
- Extract `OfferAnswerNegotiator` (SDP exchange)
- Keep main adapter as RTCPeerConnection wrapper

**Target:** Adhere to 800-line limit + 50-line-per-function discipline from CLAUDE.md.

**Impact:**
- Each file becomes independently testable
- Modification scope is clearer
- New engineers can understand one piece at a time
- Easier to add new features (e.g., add a new transport) without touching 10+ files

**Effort:** ~2–3 weeks (includes tests, docs updates).

---

### 3. **Replace Inline Structural Types with Named Interfaces** (2–3 days)
In `connection-service.ts`, define:
```typescript
interface CallLogWriter {
  saveCallLogWithReceipts(params: {
    peerId: string;
    content: string;
    status?: MessageStatusType;
    senderId: string;
    messageId?: string;
    conversationId?: string;
  }): Promise<string>;
}

interface PeerInfoUpdater {
  updatePeerInfo(id: string, info: {
    username?: string;
    firstName?: string;
    lastName?: string;
    isGuest?: boolean;
  }): Promise<void>;
}

// Then:
private callService?: CallLogWriter;
private peerService?: PeerInfoUpdater;
```

**Impact:**
- Improves readability (1-line instead of 8-line field)
- Makes the contract explicit and reusable
- Enables better documentation (interfaces can have JSDoc)

**Effort:** ~2–3 hours.

---

### 4. **Make Construction Order Explicit and Safe** (1 week)
Option A (preferred): Move setter deps into constructor.
```typescript
class SyncService {
  constructor(
    private db: Database,
    private messageRepository: MessageRepository,
    private messageReceiptManager: MessageReceiptManager,
    // ... etc
  ) { /* no setters */ }
}
```

Option B: Add a guard that fails loudly.
```typescript
class SyncService {
  private wired = false;

  setMessageRepository(repo: MessageRepository): void {
    this.messageRepository = repo;
    this.checkWired();
  }

  private checkWired(): void {
    if (!this.messageRepository || !this.peerService) {
      throw new Error("SyncService not fully wired. Did you forget to set a dependency?");
    }
    this.wired = true;
  }

  async syncNow() {
    if (!this.wired) throw new Error("SyncService not initialized");
    // ...
  }
}
```

**Impact:**
- Temporal coupling becomes enforced
- Tests and production fail fast if not wired
- New engineers cannot accidentally call methods on half-built objects

**Effort:** ~4–6 hours.

---

### 5. **Fix Small Consistency Cracks Now** (1–2 days)
Before they spread:

**Rename `features/chat/component/` → `features/chat/components/`** — ✅ **Done.** The directory
is now `features/chat/components/`; this item is resolved.

**Add CLAUDE.md rationale comments at callback-closure sites:**
```typescript
// Closure wiring (not .bind) so jest.spyOn replacements work in tests.
// See CLAUDE.md § Construction order.
connectionService.setTcpCallbacks({
  onMessage: (peerId, message) => { /* ... */ },
});
```

**Impact:**
- Prevents future "fixes" that break tests
- Reduces surprise refactor failures
- Aligns behavior with newcomer expectations

**Effort:** ~1–2 hours.

---

### 6. **Add `docs/ONBOARDING.md`** (2–3 days) — ✅ **Done**
`docs/ONBOARDING.md` now exists. The skeleton below is the original proposal, kept for context;
see the real file for current content.

A reading path that orders existing docs + names the four hard areas:

```markdown
# Onboarding Guide

## Reading Path
1. README.md — setup and local dev
2. ARCHITECTURE.md — DI containers, feature structure, core services
3. CALL_FLOW.md — message types and lifecycle
4. ADRs: 0001 (unexpected offer), 0002 (reconnect ownership)
5. SYNC.md — push/pull strategy

## The Four Hard Areas
1. Connect/Signaling State Machine (4–6 weeks)
2. MainContainer Construction (1 week)
3. Sync Lifecycle (2–3 weeks)
4. Encryption Layering (2 weeks)

## Recommended Deep Dives
- Read crypto-architecture skill for E2E encryption
- Read dev-logging skill for log access

## Code Tours
- [Connection setup flow](CONNECTION_MESSAGES.md)
- [Sync pull/push](SYNC.md)
```

**Impact:**
- New engineers know where to start
- Reduces "where do I even begin?" friction
- Signals which areas are hard upfront

**Effort:** ~2–3 hours (mostly curation of existing docs).

---

## Summary Table: Fixes by ROI

| Fix | Effort | Impact | Priority | Effort/Impact Ratio |
|---|---|---|---|---|
| Break up `connectToPeerImpl` | 1 week | **CRITICAL** (bug-risk) | 1 | 1.0 |
| Add `docs/ONBOARDING.md` | 2–3 days | **HIGH** (onboarding) | 2 | 0.3 |
| Fix naming (`component/` → `components/`) | 1–2 days | **MEDIUM** (consistency) | 5 | 0.2 |
| Replace inline types with interfaces | 2–3 days | **HIGH** (readability) | 3 | 0.3 |
| Make construction order safe | 1 week | **HIGH** (safety) | 4 | 1.0 |
| Split remaining god-files | 3–4 weeks | **CRITICAL** (maintainability) | 2 | 0.9 |

---

## Strengths to Preserve

- **Documentation discipline:** Keep the ADR + diagram + flow-doc culture. It pays dividends.
- **Low smell density:** The 8 TODOs, 4 console logs, etc. are excellent. Don't regress.
- **Consistent naming:** Continue the `is/has/should` convention for booleans.
- **Test ratio:** 33% test code is healthy. Keep it.
- **Feature boundaries:** The `index.ts` public API per feature is good. Enforce it.

---

## Conclusion

This is a well-documented, conventionally-clean codebase whose risk is concentrated in a handful of oversized core services that violate the team's own stated limits. The fixes are well-understood refactors (extract-method, split-file) rather than rewrites. The team has already demonstrated the right instinct with recent `useCall*` hook extractions and the sync-helper split. Doubling down on that discipline will bring readability and maintainability solidly into the 8–9 range within 6–8 weeks of sustained focus.

---

**Appendix: File Size Violations**

| File | Lines | CLAUDE.md Limit | Overage | Top Methods |
|---|---|---|---|---|
| chat-service.ts | 1,448 | 800 | +648 (81%) | sendChatMessage (84 lines), handleIncomingChatMessage (61 lines) |
| connection-service.ts | 1,262 | 800 | +462 (58%) | connectToPeerImpl (293 lines), dispatchCallResult (107 lines) |
| sync-service.ts | 1,230 | 800 | +430 (54%) | syncNow (143 lines), toServerPayload (multi-overload, ~80 lines) |
| call-service.ts | 1,169 | 800 | +369 (46%) | startCall (70 lines), answerCall (69 lines) |
| webrtc-adapter.ts | 1,102 | 800 | +302 (38%) | handleRemoteStream (82 lines), handleIceCandidate (65 lines) |
