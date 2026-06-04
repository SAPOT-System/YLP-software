# Auth Token Expiry — Local-First Identity Design

**Date:** 2026-06-04  
**Status:** Approved  
**Scope:** `features/auth/`, `features/shared/api/client.ts`

---

## Problem

The app is used by rescuers in disaster zones and dead zones where server connectivity cannot be guaranteed. The current authentication layer conflates two independent concerns:

1. **Is this user authenticated?** (identity — should be answered locally)
2. **Can this user make server API calls?** (access — requires network + valid JWT)

Because the current code uses JWT validity as the gate for `isAuthenticated`, users can be logged out mid-operation solely because the server is unreachable. This is incorrect behaviour for an offline-first disaster response application.

### Current bugs

- The axios interceptor clears tokens from secure store when a refresh request fails due to a **network error** (no server response). Tokens may still be valid; they should be kept.
- After a successful silent mid-session refresh, `accessToken` in React context is **not updated** — it holds the old value for the lifetime of the session.
- `refreshSession()` in `AuthProvider` has an offline fallback that sets `isAuthenticated = true` from the local DB, but this is treated as a secondary path rather than the primary one — the mental model is inverted.
- `isAccessTokenValid` and `isRefreshTokenValid` in `token-utils.ts` are byte-for-byte identical.

---

## Design

### Core Principle

> JWT is a **server access credential**, not an identity proof.  
> Identity is proven by the presence of a local user record (WatermelonDB) + `userUUID` in secure store.

---

### Authentication Model

| Question | Source of truth |
|---|---|
| Is this user authenticated? | `userUUID` in `expo-secure-store` + user record in WatermelonDB |
| Can they reach server endpoints? | Valid JWT access token (best-effort, never blocks auth state) |

`isAuthenticated` remains `true` for as long as local identity exists. An expired or missing JWT does not log the user out — it only means server-dependent features (sync, GPS relay, server signaling) will fail until tokens are refreshed.

---

### Section 1: Bootstrap Flow

**File:** `features/auth/context/auth-context.tsx`

Local identity check runs first and is synchronous. Network operations run after, in the background.

```
App start
├─ userUUID in secure store?
│  ├─ Yes → user record in WatermelonDB?
│  │  ├─ Yes → isAuthenticated = true  ← set immediately, loading spinner dismissed
│  │  │        background: if tokens exist, attempt refresh silently
│  │  │        ├─ Refresh succeeds → update accessToken in context
│  │  │        ├─ Refresh fails (network error) → stay authenticated, keep tokens
│  │  │        └─ Refresh fails (server 401) → stay authenticated, clear tokens,
│  │  │                                         set needsReloginForServer = true
│  │  └─ No local record → attempt refresh to fetch + sync user from server
│  │     ├─ Succeeds → isAuthenticated = true
│  │     └─ Fails → login screen (truly first-time or wiped device)
│  └─ No userUUID
│     ├─ Guest session in DB? → isGuest = true
│     └─ No session → login screen
```

**Key behavioural change:** The user is never shown a loading spinner while waiting for a network round-trip if local identity already exists.

---

### Section 2: Axios Interceptor

**File:** `features/shared/api/client.ts`

The interceptor distinguishes three refresh outcomes instead of treating all failures identically:

| Outcome | Action |
|---|---|
| Refresh succeeds | Update tokens in secure store; call `onTokenRefreshed(newToken)`; retry original request |
| Refresh fails — network error (`!error.response`) | Keep tokens; reject original request with network error; no auth state change |
| Refresh fails — server 401 (`error.response.status === 401`) | Clear tokens from secure store; call `onAuthFailure()`; reject request |

**Any request that fails with a network error (no response at all):** reject immediately, touch nothing — no auth state effect.

Two module-level callbacks are exported so `AuthProvider` can wire React state without circular imports:

```ts
// client.ts (additions)
let onTokenRefreshed: ((token: string) => void) | null = null;
let onAuthFailure: (() => void) | null = null;

export const setTokenRefreshCallback = (cb: (token: string) => void) => {
  onTokenRefreshed = cb;
};
export const setAuthFailureCallback = (cb: () => void) => {
  onAuthFailure = cb;
};
```

The interceptor calls these after each outcome. This also fixes the `accessToken` staleness bug — context state is updated after every silent refresh.

---

### Section 3: AuthContext Additions

**File:** `features/auth/context/auth-context.tsx`

**New state:**
```ts
const [needsReloginForServer, setNeedsReloginForServer] = useState(false);
```

Added to `AuthContextI` interface so screens can show a non-blocking reconnect banner. Does not affect `isAuthenticated`.

**Callback registration:**
```ts
useEffect(() => {
  setTokenRefreshCallback((token) => setAccessToken(token));
  setAuthFailureCallback(() => setNeedsReloginForServer(true));
}, []);
```

**Bootstrap simplification:**
The `refreshSession` offline fallback becomes the primary path. Local DB check runs first; network refresh is fire-and-forget after `isAuthenticated` is set.

---

### Section 4: token-utils.ts Cleanup

**File:** `features/auth/utils/token-utils.ts`

`isAccessTokenValid` and `isRefreshTokenValid` are identical. Replace both with one synchronous utility:

```ts
export const isTokenExpiredLocally = (token: string): boolean => {
  if (!token) return true;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 <= Date.now();
  } catch {
    return true;
  }
};
```

- Synchronous (JWT decode is pure CPU — no reason for `async`)
- Used only as a hint: "should we proactively attempt a refresh?"
- Never used as an authentication gate

---

## Files Changed

| File | Change |
|---|---|
| `features/auth/utils/token-utils.ts` | Replace two duplicate async fns with one sync `isTokenExpiredLocally` |
| `features/shared/api/client.ts` | Distinguish network errors from server 401s; add `setTokenRefreshCallback` / `setAuthFailureCallback` exports |
| `features/auth/context/auth-context.tsx` | Local-first bootstrap; register interceptor callbacks; add `needsReloginForServer` state |

---

## What Does NOT Change

- Token storage location (`expo-secure-store`) — unchanged
- Guest session logic — unchanged
- Logout flow — unchanged
- P2P transport (TCP/WebRTC) — unaffected
- Background task — unaffected (already reads tokens independently)

---

## Out of Scope

- Proactive token refresh (refresh N minutes before expiry) — future work
- Offline request queue (replay failed server requests when connectivity returns) — future work
- Biometric re-authentication — future work

---

## Testing

- Unit: `isTokenExpiredLocally` with expired, valid, malformed, and empty tokens
- Unit: interceptor callback wiring — verify `onTokenRefreshed` is called on successful refresh, `onAuthFailure` on server 401, neither on network error
- Unit: bootstrap — local record exists + tokens expired → `isAuthenticated = true` without network call
- Unit: bootstrap — no local record + network down → `isAuthenticated = false`
- Integration: silent refresh updates `accessToken` in context
- Integration: server-down scenario — all P2P features remain accessible
