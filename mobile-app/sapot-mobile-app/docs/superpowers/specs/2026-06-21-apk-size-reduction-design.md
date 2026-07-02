# APK Size Reduction Design

**Date:** 2026-06-21
**Goal:** Reduce Android APK from ~300MB to ≤100MB
**Approach:** ABI restriction + dependency cleanup + ProGuard/R8 shrinking

---

## Context

The app currently ships a fat APK that bundles native libraries for four CPU architectures:
`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`. The largest native contributors are:

- `react-native-webrtc` (libwebrtc.so) — ~40–60MB per ABI
- `@maplibre/maplibre-react-native` — ~15–25MB per ABI
- `react-native-quick-crypto` — ~5–10MB per ABI

Bundling all four ABIs multiplies these costs by 4×. Modern Android devices (post-2016) are
virtually all arm64-v8a. The other three ABIs serve <5% of the device population and add
no functional value for this app's target users.

Distribution is via direct APK sideload (no Play Store), so Play Feature Delivery and AAB
automatic ABI filtering are not available. A single arm64-v8a APK is the correct approach.

---

## Change 1 — ABI Restriction (arm64-v8a only)

**File:** `app.config.ts` → `expo-build-properties` plugin config

Add `abiFilters` to the existing `expo-build-properties` entry:

```json
["expo-build-properties", {
  "android": {
    "packagingOptions": { "pickFirst": ["**/libc++_shared.so"] },
    "abiFilters": ["arm64-v8a"],
    "enableProguardInReleaseBuilds": true,
    "enableShrinkResourcesInReleaseBuilds": true
  }
}]
```

`abiFilters` tells the Gradle build to strip all native `.so` files except those for arm64-v8a.
`enableProguardInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds` enable R8 dead-code
elimination and resource shrinking on the non-native portions of the APK.

**Estimated savings:** ~180–220MB (native libs) + ~5–15MB (R8 shrinking)

---

## Change 2 — Remove Unused Web Dependencies

**File:** `package.json`

Remove from `dependencies`:
- `react-native-web` — only needed for web browser targets; this app has no web build profile
- `react-dom` — pulled in solely by `react-native-web`
- `dotenv` — build-time only; Expo handles env vars via EAS and `expo-constants` at runtime

Metro will stop bundling these modules in all builds once removed.

**Estimated savings:** ~5–10MB (JS bundle reduction)

---

## Change 3 — Move Reactotron to devDependencies

**File:** `package.json`

Move `reactotron-react-native` from `dependencies` to `devDependencies`.

The import in `app/_layout.tsx` is already correctly `__DEV__`-gated:

```ts
if (__DEV__) {
  import("../features/shared/utils/reactotron");
}
```

Metro's production bundler dead-code-eliminates `__DEV__` blocks, so Reactotron is not
in the JS bundle. However, keeping it in `dependencies` risks native module scanning picking
it up during `expo prebuild`. Moving it to `devDependencies` makes the intent explicit
and prevents any accidental native inclusion.

**Estimated savings:** ~2–5MB

---

## Change 4 — Switch Getting-Started Header to WebP

**File:** Wherever `getting-started-header.png` is imported (one reference)

`assets/images/getting-started-header.webp` already exists alongside the PNG. Update the
import to use the `.webp` version and delete `getting-started-header.png`.

**Estimated savings:** ~0.5–1MB

---

## Change 5 — Audit SpaceMono Font Usage

**File:** `app/_layout.tsx` line 71, `assets/fonts/SpaceMono-Regular.ttf`

`SpaceMono-Regular.ttf` is loaded via `useFonts`. Audit whether any component references
`fontFamily: 'SpaceMono'`. If no component uses it, remove the `require()` from `_layout.tsx`
and delete the font file.

**Estimated savings:** ~0.1MB (minor, but eliminates a loaded-but-unused asset)

---

## Estimated Size Summary

| Change | Estimated Savings |
|---|---|
| ABI restriction (arm64-v8a only) | ~180–220MB |
| ProGuard / R8 shrinking | ~5–15MB |
| Remove react-native-web + react-dom + dotenv | ~5–10MB |
| Reactotron → devDependencies | ~2–5MB |
| PNG → WebP for getting-started header | ~0.5–1MB |
| SpaceMono audit/removal (if unused) | ~0.1MB |
| **Total estimated result** | **~70–85MB** |

Target is ≤100MB. The ABI restriction alone likely achieves this; the remaining changes
provide a ~15–30MB buffer.

---

## What Does Not Change

- Sentry remains in all builds (preview + production)
- `@maplibre/maplibre-react-native` stays in the base APK (GPS lazy-loading deferred)
- `react-native-webrtc` is untouched — P2P calls are a core feature for all users
- All runtime behaviour is identical; these are purely build-time changes

---

## Verification

After implementing:
1. Build a preview APK: `eas build --platform android --profile preview`
2. Measure APK size with `aapt dump badging <apk> | grep -i size` or check EAS build artifacts
3. Confirm arm64-v8a only: `unzip -l <apk> | grep lib/` — should show only `lib/arm64-v8a/`
4. Install on a physical arm64 device and smoke-test: call flow, GPS (rescuer), chat, QR scan
