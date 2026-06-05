# Fast Startup Design

**Date:** 2026-06-05  
**Status:** Approved

## Problem

Authenticated users always see the landing page briefly on every cold start before being redirected to HOME. The root cause is that `AuthProvider` is mounted *after* the 1500ms `AnimatedSplash` gate in `_layout.tsx`, so the auth bootstrap starts too late. Additional startup cost comes from Sentry initializing at module load and the full FontAwesome font set being loaded unconditionally.

## Goals

- Authenticated users are redirected to HOME immediately after the splash — they never see the landing page.
- Sentry JS-layer initialization does not block the splash gate.
- Font load scope is reduced so the font-ready gate clears faster.
- `getting-started-header.png` is compressed to reduce installed size and decode time.
- Splash minimum duration is reduced from 1500ms to 800ms.

## Non-Goals

- JS bundle size reduction (separate ongoing effort).
- Rerender optimization (post-startup concern).
- Changing the native Sentry crash-reporting layer (unaffected by this work).

---

## Architecture

### Provider tree restructuring

`AuthContainerProvider` and `AuthProvider` are hoisted above the splash/fonts gate so the auth bootstrap runs concurrently with font loading and the splash animation.

**Before:**
```
RootLayout (fonts gate + 1500ms splash gate)
  └── RootLayoutNav
        └── RootLayoutWithTheme
              └── AuthContainerProvider
                    └── AuthProvider       ← bootstrap starts AFTER splash
                          └── Stack
```

**After:**
```
RootLayout
  └── ThemePreferenceProvider
        └── AuthContainerProvider          ← outside splash gate
              └── AuthProvider             ← bootstrap starts immediately
                    └── RootLayoutGate (gate: !loaded || showSplash || authLoading)
                          └── SafeAreaProvider / PaperProvider / Stack
```

### Startup sequence (authenticated user)

```
App open
  ↓
Fonts load + auth bootstrap run in parallel (~50–200ms auth, ~300ms fonts)
  ↓
authLoading = false + fonts loaded + 800ms elapsed
  ↓
Splash gate clears → index.tsx renders
  ↓
isAuthenticated = true → <Redirect href={HOME}> immediately
```

---

## File Changes

### 1. `app/_layout.tsx`

**Auth provider hoisting:**
- Move `AuthContainerProvider` and `AuthProvider` to wrap the entire layout tree, outside the `if (!loaded || showSplash)` gate.
- Introduce an inner component `RootLayoutGate` that calls `useAuth()` to read `loading` (auth bootstrap state).
- Extend the gate condition to: `!loaded || showSplash || authLoading`.

**Defer Sentry initialization:**
- Remove `Sentry.init()` and all `scope.setTag()` calls from module-level.
- Move them into a `useEffect` inside `RootLayoutGate` that fires once, after the gate clears.
- The `Sentry.wrap()` call on `RootLayout` remains — it handles native crash reporting regardless of when JS init runs.

**Reduce splash duration:**
- Change the `setTimeout(() => setShowSplash(false), ...)` delay from `1500` to `800`.

**Font load scope:**
- Audit which `@expo/vector-icons` families are actually used across the app.
- In `useFonts`, replace `...FontAwesome.font` with only the specific families in use.
- Remove the `import FontAwesome from "@expo/vector-icons/FontAwesome"` import if FontAwesome is not among the used families.

### 2. `app/index.tsx`

- Add `const { loading } = useAuth()` consumption.
- Return `null` while `loading` is true — prevents landing page flash on slow devices where auth bootstrap outlasts the splash gate.

### 3. `assets/images/getting-started-header.png`

- Convert from PNG (648 KB) to WebP at display resolution.
- Target: ≤ 80 KB.
- Update the `source={require(...)}` reference in the getting-started screen to point to the new file.

---

## Error Handling

- If auth bootstrap throws, `loading` is set to `false` in the `finally` block of `AuthProvider` — the gate always clears regardless of bootstrap outcome.
- If font loading fails, the existing error boundary in `_layout.tsx` re-throws — unchanged behavior.
- Deferred Sentry init failure is non-fatal; wrap `Sentry.init()` in a try/catch and log to console in dev.

---

## Testing

- **Unit:** `auth-context` bootstrap tests remain unchanged — the provider restructuring does not affect `AuthProvider`'s internal logic.
- **Integration:** Verify `useAuth()` is accessible from `index.tsx` after the restructure (i.e. `AuthProvider` is an ancestor of the `Stack`).
- **Manual — authenticated user:** Cold-start the production build with a valid session. Confirm the landing page is never rendered; HOME loads directly after the splash.
- **Manual — unauthenticated user:** Cold-start with no session. Confirm the landing page renders correctly after the splash.
- **Manual — slow bootstrap (simulated):** Add a temporary `await delay(2000)` in the auth bootstrap to confirm the splash gate holds until auth resolves, then remove it.
- **Production build only:** All timing validations must be run against a production build. Dev builds run without Hermes and are not representative.
