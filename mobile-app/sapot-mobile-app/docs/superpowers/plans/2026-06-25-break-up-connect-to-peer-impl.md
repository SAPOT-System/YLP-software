# Break up `connectToPeerImpl` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> On execution, also copy this plan to `docs/superpowers/plans/2026-06-25-break-up-connect-to-peer-impl.md` (plan-mode restrictions prevented creating it there during planning).

## Context

The readability audit (`docs/READABILITY_AUDIT.md`) ranks **breaking up `connectToPeerImpl` as the #1 highest-impact improvement** and "the single highest bug-risk site in the codebase." It is a ~290-line method (`features/shared/services/connection-service.ts:622–910`) that stacks address de-duplication, transport-mode resolution, glare/politeness, per-mode TCP dialing, and the full WebRTC offer/answer/retry/timeout state machine into one function — duplicating the retry predicate (`_retryCount < 1 && transport !== "none"`) and the `connection-state` emit shape several times each. The outcome we want: the same runtime behavior, expressed as a thin orchestrator plus small, individually-testable pieces, so the next person can change TCP dialing or retry logic without reading 290 lines.

**Goal:** Decompose `connectToPeerImpl` into a thin orchestrator plus focused, separately-testable helpers — with zero behavior change.

**Architecture:** Hybrid extraction (user-selected). Pure decision logic (transport resolution, timeout selection, retry predicate, address de-duplication, adapter listener removal) moves to a new free-function module `connect-planning.ts` with its own unit test. Stateful steps that need `this` (per-mode TCP establishment, the WebRTC negotiation promise, the offer send, retry recursion, connection-state emission) become private methods on `ConnectionService`. The existing `connection-service.test.ts` suite is the behavior-preserving safety net.

**Tech Stack:** TypeScript, React Native / Expo, Jest, manual DI. WebRTC (`react-native-webrtc`) + TCP (`react-native-tcp-socket`) + WebSocket signaling.

## Global Constraints

- **No behavior change.** Pure refactor. The connection suite must stay green throughout; existing assertions must pass unchanged (`connectToPeer` happy path with `sendMessage` called 3×, `resolves immediately if already connected`, retry/eviction asserting `evictWebrtcAdapter("peer-1", true)` then `("peer-1", false)`, and the `connectToPeer de-duplication` tests that `jest.spyOn(... "connectToPeerImpl")`).
- **Preserve the `connectToPeerImpl` seam.** Keep it a private method on `ConnectionService` (de-dup tests spy on it by name). Keep the public `connectToPeer` wrapper untouched.
- **Scope discipline (CLAUDE.md).** Only `connectToPeerImpl` and the helpers it needs. Do NOT touch `renegotiate`, `dispatchCallResult`, or anything else, even though `renegotiate` shares the offer-send shape.
- **Definition of Done:** `npm run typecheck` passes; `npm test -- connect-planning connection-service` passes; `npm run lint` clean; no `any` in app code; `connectToPeerImpl` reduced to a ~30–40 line orchestrator.
- **Logging stays in the service.** Free functions in `connect-planning.ts` are pure (no `connectionLog`, no side effects).
- Commit after each task.

---

## File Structure

- **Create:** `features/shared/services/connect-planning.ts` — pure helpers + constants. Internal module; NOT exported from any feature barrel.
- **Create:** `features/shared/services/__tests__/connect-planning.test.ts` — standalone unit tests (mirrors `call-message-router.test.ts` convention).
- **Modify:** `features/shared/services/connection-service.ts` — replace the body of `connectToPeerImpl` with an orchestrator + 5 new private methods; import the new helpers. Reuses existing private helpers as-is: `connectTcpWithRetry`, `sendProfileInfo`, `buildSignalSenderData`, `sendMessage`, `isTcpAllowed`, `isWebSocketAllowed`, `getTcpClientAdapter`.
- **Unchanged safety net:** `features/shared/services/__tests__/connection-service.test.ts`.

---

## Task 1: Pure connect-planning helpers (`connect-planning.ts`)

**Files:**
- Create: `features/shared/services/connect-planning.ts`
- Test: `features/shared/services/__tests__/connect-planning.test.ts`

**Interfaces:**
- Consumes: `AppMode` type from `@/features/shared/stores/app-mode-store` (the `"auto" | "server" | "lan"` union — confirm the exact export name/path before importing; reported at `app-mode-store.ts:47`).
- Produces (relied on by Task 2):
  - `type SignalingTransport = "ws" | "tcp" | "none"`
  - `dedupeCandidateAddresses(ipAddress?: string, addresses?: string[]): string[]`
  - `resolveSignalingTransport(isWsConfigured: boolean, canUseTcp: boolean): SignalingTransport`
  - `resolveConnectTimeoutMs(mode: AppMode): number`
  - `shouldRetryConnect(retryCount: number, transport: SignalingTransport): boolean`
  - `removeAdapterListener(adapter: unknown, eventName: string, callback: (...args: unknown[]) => void): void`
  - constants `LAN_CONNECT_TIMEOUT_MS = 7000`, `SERVER_CONNECT_TIMEOUT_MS = 15000`, `AUTO_CONNECT_TIMEOUT_MS = 10000`, `MAX_CONNECT_RETRIES = 1`

- [ ] **Step 1: Write the failing test**

Create `features/shared/services/__tests__/connect-planning.test.ts`:

```typescript
import {
  dedupeCandidateAddresses,
  resolveSignalingTransport,
  resolveConnectTimeoutMs,
  shouldRetryConnect,
  removeAdapterListener,
  LAN_CONNECT_TIMEOUT_MS,
  SERVER_CONNECT_TIMEOUT_MS,
  AUTO_CONNECT_TIMEOUT_MS,
} from "../connect-planning";

describe("dedupeCandidateAddresses", () => {
  it("puts the preferred ipAddress first and de-duplicates", () => {
    expect(dedupeCandidateAddresses("10.0.0.1", ["10.0.0.2", "10.0.0.1"])).toEqual([
      "10.0.0.1",
      "10.0.0.2",
    ]);
  });

  it("drops falsy values and handles undefined inputs", () => {
    expect(dedupeCandidateAddresses(undefined, undefined)).toEqual([]);
    expect(dedupeCandidateAddresses("", ["10.0.0.2"])).toEqual(["10.0.0.2"]);
  });
});

describe("resolveSignalingTransport", () => {
  it("prefers ws when ws is configured", () => {
    expect(resolveSignalingTransport(true, true)).toBe("ws");
    expect(resolveSignalingTransport(true, false)).toBe("ws");
  });

  it("falls back to tcp when ws not configured but tcp allowed", () => {
    expect(resolveSignalingTransport(false, true)).toBe("tcp");
  });

  it("returns none when neither is available", () => {
    expect(resolveSignalingTransport(false, false)).toBe("none");
  });
});

describe("resolveConnectTimeoutMs", () => {
  it("uses per-mode timeouts", () => {
    expect(resolveConnectTimeoutMs("lan")).toBe(LAN_CONNECT_TIMEOUT_MS);
    expect(resolveConnectTimeoutMs("server")).toBe(SERVER_CONNECT_TIMEOUT_MS);
    expect(resolveConnectTimeoutMs("auto")).toBe(AUTO_CONNECT_TIMEOUT_MS);
  });
});

describe("shouldRetryConnect", () => {
  it("retries once when a signaling transport exists", () => {
    expect(shouldRetryConnect(0, "ws")).toBe(true);
    expect(shouldRetryConnect(0, "tcp")).toBe(true);
  });

  it("does not retry past the limit or with no transport", () => {
    expect(shouldRetryConnect(1, "ws")).toBe(false);
    expect(shouldRetryConnect(0, "none")).toBe(false);
  });
});

describe("removeAdapterListener", () => {
  it("uses off when present", () => {
    const off = jest.fn();
    const cb = jest.fn();
    removeAdapterListener({ off }, "connection-failed", cb);
    expect(off).toHaveBeenCalledWith("connection-failed", cb);
  });

  it("falls back to removeListener when off is absent", () => {
    const removeListener = jest.fn();
    const cb = jest.fn();
    removeAdapterListener({ removeListener }, "connection-failed", cb);
    expect(removeListener).toHaveBeenCalledWith("connection-failed", cb);
  });

  it("is a no-op when neither method exists", () => {
    expect(() => removeAdapterListener({}, "x", jest.fn())).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- connect-planning`
Expected: FAIL — cannot find module `../connect-planning`.

- [ ] **Step 3: Write the implementation**

Create `features/shared/services/connect-planning.ts`:

```typescript
import type { AppMode } from "@/features/shared/stores/app-mode-store";

/** Signaling channel selected for a connect attempt. */
export type SignalingTransport = "ws" | "tcp" | "none";

export const LAN_CONNECT_TIMEOUT_MS = 7000;
export const SERVER_CONNECT_TIMEOUT_MS = 15000;
export const AUTO_CONNECT_TIMEOUT_MS = 10000;
export const MAX_CONNECT_RETRIES = 1;

/**
 * Build the de-duplicated dial list for a (possibly dual-homed) peer: the
 * preferred address first, then any other advertised addresses, falsy removed.
 */
export function dedupeCandidateAddresses(
  ipAddress?: string,
  addresses?: string[]
): string[] {
  return Array.from(
    new Set([ipAddress, ...(addresses ?? [])].filter((a): a is string => Boolean(a)))
  );
}

/** ws is preferred when configured; otherwise tcp if allowed; otherwise none. */
export function resolveSignalingTransport(
  isWsConfigured: boolean,
  canUseTcp: boolean
): SignalingTransport {
  return isWsConfigured ? "ws" : canUseTcp ? "tcp" : "none";
}

export function resolveConnectTimeoutMs(mode: AppMode): number {
  if (mode === "lan") return LAN_CONNECT_TIMEOUT_MS;
  if (mode === "server") return SERVER_CONNECT_TIMEOUT_MS;
  return AUTO_CONNECT_TIMEOUT_MS;
}

/** Retry once, and only when a signaling transport is available. */
export function shouldRetryConnect(
  retryCount: number,
  transport: SignalingTransport
): boolean {
  return retryCount < MAX_CONNECT_RETRIES && transport !== "none";
}

/**
 * Remove a listener from a WebRTC adapter that exposes either `off` or
 * `removeListener`. The adapter's static type declares neither, so we duck-type.
 */
export function removeAdapterListener(
  adapter: unknown,
  eventName: string,
  callback: (...args: unknown[]) => void
): void {
  const withListeners = adapter as {
    off?: (event: string, cb: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  };
  if (typeof withListeners.off === "function") {
    withListeners.off(eventName, callback);
    return;
  }
  if (typeof withListeners.removeListener === "function") {
    withListeners.removeListener(eventName, callback);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- connect-planning`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS. If `AppMode` is not the correct export from `app-mode-store.ts`, fix the import to the actual exported type for the `"auto" | "server" | "lan"` union.

- [ ] **Step 6: Commit**

```bash
git add features/shared/services/connect-planning.ts features/shared/services/__tests__/connect-planning.test.ts
git commit -m "refactor(connection): extract pure connect-planning helpers"
```

---

## Task 2: Refactor `connectToPeerImpl` into orchestrator + private methods

**Files:**
- Modify: `features/shared/services/connection-service.ts` (current `connectToPeerImpl` at lines 622–910)
- Safety net (do not edit): `features/shared/services/__tests__/connection-service.test.ts`

**Interfaces:**
- Consumes from Task 1: `dedupeCandidateAddresses`, `resolveSignalingTransport`, `resolveConnectTimeoutMs`, `shouldRetryConnect`, `removeAdapterListener`, `SignalingTransport`.
- Produces (new private methods, internal): `establishTcpForMode(...)`, `negotiateWebrtcConnection(...)`, `sendConnectionOffer(...)`, `retryConnect(...)`, `emitConnectionState(...)`.
- Reuses existing types in the file: `AppMode`, `WebrtcAdapter`, `TcpClientAdapter`, and `ConnectionStatePayload` (its `state` field is the union `"connecting" | "connected" | "failed" | "timeout"`; confirm exact members before typing `emitConnectionState`).

- [ ] **Step 1: Establish the green baseline**

Run: `npm test -- connection-service`
Expected: PASS. This is the regression oracle — every later step must keep it green.

- [ ] **Step 2: Add the import**

At the top of `connection-service.ts`, with the other relative imports, add:

```typescript
import {
  dedupeCandidateAddresses,
  resolveSignalingTransport,
  resolveConnectTimeoutMs,
  shouldRetryConnect,
  removeAdapterListener,
  type SignalingTransport,
} from "./connect-planning";
```

If a local inline `"ws" | "tcp" | "none"` literal exists elsewhere, prefer the imported `SignalingTransport` to avoid a second pattern.

- [ ] **Step 3: Add `emitConnectionState` private helper**

Add near the other private helpers (e.g. after `buildSignalSenderData`):

```typescript
private emitConnectionState(
  peerId: string,
  state: ConnectionStatePayload["state"],
  transport: SignalingTransport,
  mode: AppMode,
  error?: unknown
): void {
  this.emit("connection-state", {
    peerId,
    state,
    transport,
    mode,
    // Preserve original payload shape: only the "failed" path carried `error`.
    ...(error !== undefined ? { error } : {}),
  });
}
```

- [ ] **Step 4: Add `retryConnect` private helper**

Encapsulates "evict the wedged adapter, then redial with an incremented retry count" used by the connection-failed and timeout paths:

```typescript
private retryConnect(
  peerId: string,
  ipAddress: string | undefined,
  port: number | undefined,
  addresses: string[] | undefined,
  retryCount: number
): Promise<void> {
  this.webrtcSessionManager.evictWebrtcAdapter(peerId, true);
  return this.connectToPeer(peerId, ipAddress, port, addresses, retryCount + 1);
}
```

- [ ] **Step 5: Add `establishTcpForMode` private helper**

Lift Section E verbatim (per-mode TCP branching). Returns whether TCP is connected. Preserve the literal `connectTcpWithRetry(..., 2)` and the auto-mode WS fallback exactly:

```typescript
private async establishTcpForMode(params: {
  peerId: string;
  mode: AppMode;
  tcpAdapter: TcpClientAdapter;
  candidateAddresses: string[];
  port?: number;
  canUseTcp: boolean;
  isWsConfigured: boolean;
}): Promise<boolean> {
  const { peerId, mode, tcpAdapter, candidateAddresses, port, canUseTcp, isWsConfigured } =
    params;
  let isTcpConnected = tcpAdapter.isConnected;

  if (mode === "server") {
    if (!isWsConfigured) {
      throw new Error("Websocket signaling is required in server mode");
    }
    return isTcpConnected;
  }

  if (mode === "lan") {
    if (!canUseTcp) {
      throw new Error("TCP transport is required in lan mode");
    }
    if (!isTcpConnected) {
      if (candidateAddresses.length === 0 || !port) {
        throw new Error("TCP connection requires ipAddress and port");
      }
      await this.connectTcpWithRetry(tcpAdapter, candidateAddresses, port, 2);
      isTcpConnected = true;
      this.sendProfileInfo(peerId);
    }
    return isTcpConnected;
  }

  // auto
  if (canUseTcp && !isTcpConnected) {
    if (candidateAddresses.length > 0 && port) {
      try {
        await this.connectTcpWithRetry(tcpAdapter, candidateAddresses, port, 2);
        isTcpConnected = true;
        this.sendProfileInfo(peerId);
      } catch (error) {
        connectionLog.warn("connection › tcp connect failed after retries", {
          peerId,
          error,
        });
        if (!isWsConfigured) {
          throw error;
        }
        // WS is configured — fall through to WebRTC over WS
      }
    } else if (!isWsConfigured) {
      throw new Error("No signaling transport available in auto mode");
    }
  }
  return isTcpConnected;
}
```

- [ ] **Step 6: Add `sendConnectionOffer` private helper**

Lift the `createOffer().then(...)` success body (offer creation + optional TCP handshake + signaling send). `sendSignalingMessage` stays fire-and-forget (`void`):

```typescript
private async sendConnectionOffer(
  peerId: string,
  webrtcAdapter: WebrtcAdapter,
  isTcpConnected: boolean
): Promise<void> {
  const { type, sdp } = await webrtcAdapter.createOffer();
  connectionLog.debug("connection › webrtc offer created", {
    peerId,
    type,
    hasSdp: Boolean(sdp),
  });
  // Handshake is only needed for direct TCP fallback routing.
  if (isTcpConnected) {
    connectionLog.debug("connection › tcp handshake sent", { peerId });
    this.sendMessage(peerId, {
      type: "handshake",
      data: {
        ...this.buildSignalSenderData(peerId),
        wsAllowed: this.appModeStore.isWebSocketAllowed(this.userStore.isGuest),
      },
    });
  }
  void this.signalingService.sendSignalingMessage(peerId, {
    type,
    data: {
      sdp: { type, sdp },
      ...this.buildSignalSenderData(peerId),
    },
  });
}
```

- [ ] **Step 7: Add `negotiateWebrtcConnection` private helper**

Lift Section F (the negotiation promise). The `createOffer`-catch keeps its **explicit** eviction (`evictWebrtcAdapter(peerId, willRetry)` fires unconditionally there, unlike `retryConnect` which always evicts with `true`) — do NOT route it through `retryConnect`:

```typescript
private negotiateWebrtcConnection(params: {
  peerId: string;
  ipAddress?: string;
  port?: number;
  addresses?: string[];
  retryCount: number;
  webrtcAdapter: WebrtcAdapter;
  signalingTransport: SignalingTransport;
  effectiveMode: AppMode;
  isTcpConnected: boolean;
}): Promise<void> {
  const {
    peerId,
    ipAddress,
    port,
    addresses,
    retryCount,
    webrtcAdapter,
    signalingTransport,
    effectiveMode,
    isTcpConnected,
  } = params;

  return new Promise<void>((resolve, reject) => {
    let isSettled = false;
    let timeout: ReturnType<typeof setTimeout>;
    const timeoutMs = resolveConnectTimeoutMs(effectiveMode);

    this.emitConnectionState(peerId, "connecting", signalingTransport, effectiveMode);

    const cleanup = () => {
      clearTimeout(timeout);
      removeAdapterListener(webrtcAdapter, "connection-established", onConnectionEstablished);
      removeAdapterListener(webrtcAdapter, "connection-failed", onConnectionFailed);
    };

    const onConnectionEstablished = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      connectionLog.info("connection › webrtc connected", { peerId });
      this.emitConnectionState(peerId, "connected", signalingTransport, effectiveMode);
      resolve();
    };

    const onConnectionFailed = (error: unknown) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      connectionLog.error("connection › webrtc connection failed", { peerId, error });
      if (shouldRetryConnect(retryCount, signalingTransport)) {
        connectionLog.info("connection › webrtc retry after failure", {
          peerId,
          transport: signalingTransport,
          _retryCount: retryCount,
        });
        this.retryConnect(peerId, ipAddress, port, addresses, retryCount)
          .then(resolve)
          .catch(reject);
        return;
      }
      this.emitConnectionState(peerId, "failed", signalingTransport, effectiveMode, error);
      reject(error);
    };

    webrtcAdapter.once("connection-established", onConnectionEstablished);
    webrtcAdapter.once("connection-failed", onConnectionFailed);

    timeout = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      connectionLog.warn("connection › connect timeout", { peerId, timeoutMs });
      if (shouldRetryConnect(retryCount, signalingTransport)) {
        connectionLog.info("connection › webrtc timeout retry", {
          peerId,
          transport: signalingTransport,
          _retryCount: retryCount,
        });
        this.retryConnect(peerId, ipAddress, port, addresses, retryCount)
          .then(resolve)
          .catch(reject);
        return;
      }
      this.emitConnectionState(peerId, "timeout", signalingTransport, effectiveMode);
      reject(new Error("Connection timeout"));
    }, timeoutMs);

    this.sendConnectionOffer(peerId, webrtcAdapter, isTcpConnected).catch((error) => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      connectionLog.warn("connection › connect failed", {
        peerId,
        hasIpAddress: Boolean(ipAddress),
        hasPort: Boolean(port),
        error,
      });
      // createOffer failure usually means a wedged/dead PC — discard it so the
      // retry (and later reconnects) rebuild a fresh one instead of looping.
      const willRetry = shouldRetryConnect(retryCount, signalingTransport);
      this.webrtcSessionManager.evictWebrtcAdapter(peerId, willRetry);
      if (willRetry) {
        connectionLog.info("connection › retry after createOffer failure", {
          peerId,
          transport: signalingTransport,
          _retryCount: retryCount,
        });
        this.connectToPeer(peerId, ipAddress, port, addresses, retryCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }
      this.emitConnectionState(peerId, "failed", signalingTransport, effectiveMode, error);
      reject(error);
    });
  });
}
```

- [ ] **Step 8: Replace the `connectToPeerImpl` body with the orchestrator**

Replace the entire current body (everything after the signature, lines 629–909) with:

```typescript
connectionLog.info("connection › connect start", {
  peerId,
  hasIpAddress: Boolean(ipAddress),
  hasPort: Boolean(port),
});

const candidateAddresses = dedupeCandidateAddresses(ipAddress, addresses);
const tcpAdapter = this.getTcpClientAdapter(peerId);
const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
webrtcAdapter.setIsPolite(this.userStore.user.id < peerId);

const effectiveMode = this.appModeStore.getEffectiveMode(this.userStore.isGuest);
const canUseWebsocket = this.isWebSocketAllowed();
const canUseTcp = this.isTcpAllowed();
const isWsConfigured = canUseWebsocket
  ? this.signalingService.ensureWsSignaling()
  : false;
const signalingTransport = resolveSignalingTransport(isWsConfigured, canUseTcp);

connectionLog.debug("connection › signaling availability", {
  peerId,
  tcpConnected: tcpAdapter.isConnected,
  websocketConfigured: isWsConfigured,
  mode: effectiveMode,
});

if (webrtcAdapter.isConnected) {
  connectionLog.info("connection › already connected", { peerId });
  this.emitConnectionState(peerId, "connected", signalingTransport, effectiveMode);
  return;
}

const isTcpConnected = await this.establishTcpForMode({
  peerId,
  mode: effectiveMode,
  tcpAdapter,
  candidateAddresses,
  port,
  canUseTcp,
  isWsConfigured,
});

return this.negotiateWebrtcConnection({
  peerId,
  ipAddress,
  port,
  addresses,
  retryCount: _retryCount,
  webrtcAdapter,
  signalingTransport,
  effectiveMode,
  isTcpConnected,
});
```

Keep the `connectToPeerImpl` signature (`private async connectToPeerImpl(peerId, ipAddress?, port?, addresses?, _retryCount = 0)`) and the public `connectToPeer` wrapper exactly as they are.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Resolve any mismatch on `ConnectionStatePayload["state"]`, `AppMode`, or `WebrtcAdapter` by aligning with the types already declared/imported in this file.

- [ ] **Step 10: Run the connection suite (regression oracle)**

Run: `npm test -- connection-service`
Expected: PASS — identical to the Step 1 baseline, including:
- "should connect to peer successfully" (`sendMessage` called 3×: profile-info, handshake, offer)
- "should resolve immediately if already connected"
- "evicts the wedged adapter when createOffer fails …" (`evictWebrtcAdapter` with `("peer-1", true)` then `("peer-1", false)`)
- "connectToPeer de-duplication" (both tests spying on `connectToPeerImpl`)
- signaling/call transport routing suites

If any test fails, the extraction changed behavior — diff against the original body section-by-section (original Sections A–F map 1:1 to the new methods) rather than editing the test.

- [ ] **Step 11: Commit**

```bash
git add features/shared/services/connection-service.ts
git commit -m "refactor(connection): decompose connectToPeerImpl into focused helpers"
```

---

## Task 3: Final verification & doc-sync check

**Files:** none modified unless a check fails.

- [ ] **Step 1: Lint** — Run `npm run lint`. Expected: clean. No `any` introduced; no `console.*`.
- [ ] **Step 2: Both affected suites** — Run `npm test -- connect-planning connection-service`. Expected: PASS.
- [ ] **Step 3: Full typecheck** — Run `npm run typecheck`. Expected: PASS.
- [ ] **Step 4: Doc-sync check (CLAUDE.md)** — `connect-planning.ts` is an internal pure-helper module, not a new service/adapter/store/DI-wiring/transport change, so CLAUDE.md doc-sync triggers do NOT apply; no `docs/` edit required. Confirm `docs/architecture.md` / `docs/ARCHITECTURE.md` still describe `ConnectionService` accurately (they should — behavior unchanged). Make no doc edits unless something is now inaccurate.
- [ ] **Step 5: Confirm size limits** — `connectToPeerImpl` is now a ~30–40 line orchestrator; `establishTcpForMode`, `sendConnectionOffer`, `retryConnect`, `emitConnectionState` are well under 50 lines; `negotiateWebrtcConnection` is the inherently-cohesive promise body (target < ~100). `connect-planning.ts` is well under 800 lines.

---

## Verification (end-to-end)

1. `npm run typecheck` — green.
2. `npm test -- connect-planning connection-service` — green; the pre-refactor connection assertions pass unchanged (the behavior-preservation proof).
3. `npm run lint` — clean.
4. Manual diff sanity: each original Section A–F (entry/dedupe, adapters/politeness, transport resolution, already-connected exit, per-mode TCP, WebRTC negotiation) is now traceable to exactly one new function, with the three retry sites (connection-failed, timeout, createOffer-catch) preserving their distinct eviction semantics.

## Notes / out of scope

- `renegotiate` shares the offer-create-and-send shape with `sendConnectionOffer` and could reuse it later, but it has different lifecycle semantics (no timeout/retry) and is **out of scope** here per scope discipline.
- Splitting `connection-service.ts` as a whole file (audit issue #2) is a separate, larger effort, not part of this plan.
