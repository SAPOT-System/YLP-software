# Error Handling Overhaul Design

**Date:** 2026-06-04
**Status:** Approved

---

## Problem

The codebase has ~424 catch blocks across repositories, services, hooks, and screens. The patterns are largely consistent (scoped loggers, log+rethrow in repos, log+state in hooks) but have four structural gaps:

1. **Sentry is initialized but never used** — `Sentry.captureException` is never called; errors are logged locally only.
2. **No error taxonomy** — catch sites duck-type errors (`axiosError.response`, `error.message`) without type safety.
3. **No severity model** — every error is treated equally; there is no way to distinguish a fatal crypto failure from a recoverable GPS timeout.
4. **TypeScript does not enforce typed catches** — `useUnknownInCatchVariables` is off; any catch block can access `error.message` without narrowing.

---

## Approach: Shim-Assisted Full Migration

Build a shared error module with a `toAppError(unknown)` one-liner shim. Every catch site becomes a mechanical one-liner conversion, making a big-bang migration of all 424 sites safe and reviewable in a single PR.

---

## Architecture

### New module: `features/shared/errors/`

```
features/shared/errors/
  app-error.ts          # AppError class + ErrorDomain + ErrorSeverity
  to-app-error.ts       # toAppError(unknown, domain?): AppError
  sentry-capture.ts     # captureAppError(AppError, extras?): void
  index.ts              # public barrel
```

### Data flow after migration

```
throw (native / axios / unknown)
       ↓
catch (error)
  const appErr = toAppError(error, "domain")
  scopedLog.error("...", appErr)       ← structured log (unchanged)
  captureAppError(appErr)              ← Sentry, only if severity >= high
  throw appErr                         ← typed error propagates upstream
```

---

## AppError Class

```typescript
type ErrorDomain =
  | "network"    // HTTP, WebSocket, TCP failures
  | "auth"       // token expiry, 401s, key recovery
  | "database"   // WatermelonDB read/write
  | "crypto"     // NaCl box, key derivation, decryption
  | "media"      // camera/mic init, WebRTC tracks
  | "gps"        // location watch, permission, WS stream
  | "signaling"  // SDP/ICE exchange, relay
  | "sync"       // server sync pull/push
  | "unknown"    // unclassified

type ErrorSeverity = "low" | "medium" | "high" | "critical"
// low      → log only, no Sentry, no user toast
// medium   → log only, no Sentry, optional user toast
// high     → log + Sentry, show user error message
// critical → log + Sentry, may force logout or block flow

class AppError extends Error {
  readonly domain: ErrorDomain
  readonly severity: ErrorSeverity
  readonly cause?: unknown  // original error preserved
}
```

---

## toAppError Shim

```typescript
function toAppError(error: unknown, domain?: ErrorDomain): AppError {
  if (error instanceof AppError) return error

  if (isAxiosError(error)) {
    const status = error.response?.status
    const severity = status === 401 ? "high" : "medium"
    return new AppError(error.message, domain ?? "network", severity, error)
  }

  if (error instanceof Error) {
    return new AppError(error.message, domain ?? "unknown", "medium", error)
  }

  return new AppError(String(error), domain ?? "unknown", "low", error)
}
```

The `domain` hint is passed by each catch site from its local context — callers do not need per-error instanceof checks.

---

## Sentry Integration

```typescript
const SENTRY_THRESHOLD: ErrorSeverity = "high"

const SEVERITY_RANK: Record<ErrorSeverity, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
}

function captureAppError(error: AppError, extras?: Record<string, unknown>): void {
  if (SEVERITY_RANK[error.severity] < SEVERITY_RANK[SENTRY_THRESHOLD]) return

  Sentry.captureException(error.cause ?? error, {
    tags: { domain: error.domain, severity: error.severity },
    extra: extras,
  })
}
```

`SENTRY_THRESHOLD` is a single constant — adjustable without touching call sites.

**What gets sent to Sentry:**
- `high`: rethrown service/repo errors that bubble to hooks (WatermelonDB write failures, 401 refresh)
- `critical`: crypto failures, auth container init failures, call media failures

**What stays local:**
- `low`: GPS heartbeat timeouts, stale credential fallbacks
- `medium`: non-fatal connect failures, peer row ensure failures

---

## Migration Strategy

### Step 1 — Build the error module

Implement `features/shared/errors/` with full unit tests before touching any catch block.

### Step 2 — Migrate in layer order

**Repositories** (log + rethrow — most uniform):
```typescript
} catch (error) {
  const appErr = toAppError(error, "database")
  peerLog.error("peer › create failed", appErr)
  captureAppError(appErr)
  throw appErr
}
```

**Services** (rethrow path + fallback path):
```typescript
// Rethrow path
} catch (error) {
  const appErr = toAppError(error, "signaling")
  signalingLog.error("signaling › send failed", appErr)
  captureAppError(appErr)
  throw appErr
}

// Fallback path (recoverable — no Sentry)
} catch (error) {
  const appErr = toAppError(error, "signaling")
  signalingLog.warn("signaling › credential refresh failed", appErr)
}
```

**Hooks** (set error state):
```typescript
} catch (error) {
  const appErr = toAppError(error, "auth")
  authLog.error("[useRegister] register failed", appErr)
  captureAppError(appErr)
  setErrors({ general: appErr.message })
}
```

**Screens** (user feedback):
```typescript
} catch (error) {
  const appErr = toAppError(error, "network")
  uiLog.error("chat › send message failed", appErr)
  captureAppError(appErr)
  showError(appErr.severity === "critical" ? "A critical error occurred" : "Failed to send message")
}
```

### Step 3 — Enable TypeScript enforcement

Add to `tsconfig.json`:
```json
"useUnknownInCatchVariables": true
```

This is the final gate — zero compiler errors confirms all 424 sites are migrated.

### Domain assignment by file location

| File location | Default domain |
|---|---|
| `features/auth/` | `"auth"` |
| `features/chat/` | `"network"` or `"database"` |
| `features/call/` | `"media"` or `"signaling"` |
| `features/gps/` | `"gps"` |
| `features/shared/repositories/` | `"database"` |
| `features/shared/services/signaling*` | `"signaling"` |
| `features/shared/services/key*` | `"crypto"` |
| `features/sync/` | `"sync"` |
| `app/` screens | inherited from the service being called |

---

## Testing

### Unit tests for `features/shared/errors/__tests__/`

**`toAppError`:**
- Passes `AppError` instances through unchanged
- Maps Axios 401 → `auth` domain, `high` severity
- Maps Axios non-401 → `network` domain, `medium` severity
- Maps native `Error` → `unknown` domain, `medium` severity
- Maps string → `unknown` domain, `low` severity
- Accepts domain override that takes precedence over inference

**`captureAppError`:**
- Calls `Sentry.captureException` for `high` severity
- Calls `Sentry.captureException` for `critical` severity
- Does not call Sentry for `low` severity
- Does not call Sentry for `medium` severity
- Tags `domain` and `severity` on the Sentry event
- Sends `cause` as the primary exception when present

### Existing tests

Tests that currently `expect(fn).rejects.toThrow(Error)` become `expect(fn).rejects.toThrow(AppError)`. The `cause` field lets tests verify the original error is preserved.

`captureAppError` is mocked in `jest-setup.js` globally so existing tests do not hit Sentry.

### Coverage requirement

`features/shared/errors/` must reach 100% — it is small, pure TypeScript, and is the foundation everything else depends on.

---

## Non-Goals

- No changes to logging scope names or log format
- No changes to user-facing error message strings (those stay in hooks/screens)
- No Sentry dashboard configuration (filter rules, alert thresholds) — out of scope
- No retry logic — error handling only; retry strategies are a separate concern
