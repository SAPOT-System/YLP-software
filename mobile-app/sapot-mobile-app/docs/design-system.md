# Design System

## Theming

The app uses **Material Design 3** via `react-native-paper`. No colors are hardcoded in components.

### Theme Setup (`app/_layout.tsx`)

Two theme objects are constructed at the root and selected based on `resolvedTheme`:

```typescript
const customDarkTheme  = { ...MD3DarkTheme,  colors: Colors.dark  };
const customLightTheme = { ...MD3LightTheme, colors: Colors.light };
const CombinedDefaultTheme = merge(LightTheme, customLightTheme);
const CombinedDarkTheme    = merge(DarkTheme,  customDarkTheme);
```

`Colors.dark` / `Colors.light` are the only place where color values are defined.

### ThemePreferenceProvider (`features/shared/core/context/theme-preference-context.tsx`)

Exposes:
- `themeChoice` — `"light" | "dark" | "system"` (user-persisted preference)
- `resolvedTheme` — actual resolved value after applying system preference

### Usage in Components

```typescript
const theme = useTheme(); // from react-native-paper
// theme.colors.primary, theme.colors.onBackground, theme.colors.surface, etc.
```

---

## Navigation

File-based routing via Expo Router (`app/` directory).

```
app/
  ├─ _layout.tsx          ← root layout + provider stack
  ├─ index.tsx            ← splash / entry redirect
  ├─ auth/                ← auth screens (login, register, forgot-password, etc.)
  ├─ (drawer)/            ← main app (drawer + nested tabs/stacks)
  │  └─ (tabs)/
  │     └─ chat/[id].tsx  ← dynamic chat screen
  ├─ getting-started/
  └─ +not-found.tsx
```

### Root Provider Stack Order

Order is load-bearing — each provider depends on those above it:

```
ThemePreferenceProvider
  └─ AuthContainerProvider
     └─ AuthProvider       ← auth state machine; drives auth vs. main branch
        └─ RootLayoutGate  ← Sentry init (deferred until fonts loaded + auth bootstrapped)
```

Auth state determines which branch renders: auth screens or the drawer. `AppModeProvider` and `MainContainerProvider` are mounted conditionally inside the authenticated branch only.

---

## Component Conventions

### Props Pattern

Named interface, no `React.FC`:

```typescript
interface PageLoaderProps {
  skeleton?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const PageLoader = ({ skeleton, style }: PageLoaderProps) => (
  <View testID="page-loader-container" style={[styles.container, style]}>
    {skeleton ?? <LoadingSpinner size="large" />}
  </View>
);
```

### Naming

| Concept | Convention | Example |
|---------|-----------|---------|
| Components | `PascalCase` | `CallBanner`, `PageLoader` |
| Hooks | `camelCase` + `use` prefix | `useCallService`, `useThrottledPress` |
| Feature context | `PascalCase` + `Context` suffix | `CallContext`, `GpsPreferenceContext` |

### Safe-area Insets

All screens use safe-area insets. Never hardcode status bar or home indicator padding.

### Dimensions

No hardcoded dimensions — use flex layouts throughout.

---

## Permission States

Every flow touching camera, mic, location, or notifications must render distinct UI for all three states. Never assume `granted`.

| State | Required UI |
|-------|-------------|
| `not-asked` | Explanation + "Request permission" button |
| `denied` | "Permission denied" message + link to device settings |
| `granted` | The feature itself |

### Hooks

- `useMediaPermissions` (`features/shared/hooks/use-media-permissions.ts`) — camera/mic (Android `PermissionsAndroid`)
- `useLocationPermission` (`features/gps/hooks/useLocationPermission.ts`) — GPS location

GPS sharing preference is stored in `expo-secure-store` under key `gps_sharing_enabled`.

---

## Offline & Error States

Every network call must catch failure and surface a user-visible state. No indefinite spinners. No silently swallowed errors.

### Shared Error UI Components

| Component | Use |
|-----------|-----|
| `PageLoader` | Spinner or skeleton while loading |
| `FailedDialog` | Modal error display |
| `AppSnackbar` | Toast-style message |
| `OfflineExpiredBanner` | Persistent offline / session-expired indicator |
| `ServerStatusBanner` | Slides in from top when server unreachable; auto-dismisses on recovery |
| `ServerDownReloginTransition` | Full-screen prompt to re-login when auth fails |
| `ReloginBanner` | Inline prompt on 401/403 |

Root `ErrorBoundary` wraps the app (via Expo Router) and logs to Sentry.

---

## Feature-Level Context

Some features create local React contexts for state scoped to a screen or feature — these are not injection points and are not in the root provider stack.

```typescript
// features/call/context/call-context.tsx
export const CallContext = createContext<CallState | null>(null);

// features/gps/context/gps-preference-context.tsx
export const GpsPreferenceContext = createContext<GpsPreference | null>(null);
```

---

## Map Rendering

GPS / map feature uses `@maplibre/maplibre-react-native`. `useLatestLocations` polls `GET /gps/latest` every 5 seconds via React Query and passes results to the map renderer.

---

## Motion

Shared motion tokens live in `constants/motion.ts` — duration scale, easing curves, and spring presets. Easing curves are stored as raw cubic-bezier tuples (not `Easing.bezier(...)` instances) because the legacy `Animated` API and Reanimated's `Easing` are separate, incompatible modules; call sites wrap the tuple themselves: `Easing.bezier(...motion.easing.standard)`.

```typescript
motion.duration.fast   // 150 — micro-interactions: toggles, icon crossfades
motion.duration.base   // 250 — general transitions: fades, list-item entrances
motion.duration.slow   // 400 — deliberate/looping motion: skeleton shimmer

motion.easing.standard   // general UI transitions
motion.easing.emphasized // deliberate entrances: success states, pop-ins
motion.easing.exit       // exits and fade-outs

motion.spring.gentle    // { damping: 12, stiffness: 120 } — banners, success states
```

### Reduced Motion

`useReducedMotion()` (`features/shared/hooks/use-reduced-motion.ts`) wraps `AccessibilityInfo.isReduceMotionEnabled()`. Every animated component must check it and either set the end value instantly or drop duration/entering animation to none — never skip the check.

```typescript
const reducedMotion = useReducedMotion();

<Animated.View
  entering={reducedMotion ? undefined : FadeInUp.duration(motion.duration.base)}
>
```

### Shared Motion Components

| Component | Use | Location |
|-----------|-----|----------|
| `Crossfade` | Fades content out/in when a keyed value changes (status text, icons) | `features/shared/components/crossfade.tsx` |
| `Skeleton` | Pulsing placeholder box for skeleton loading layouts | `features/shared/components/skeleton.tsx` |

`Crossfade` takes an `activeKey` (string/number/boolean) and re-fades its children whenever that key changes — used for connection-status labels (`chat/[id].tsx`, `public-chat.tsx`) and the Zeroconf status icon (`zeroconf-status-indicator.tsx`).

`Skeleton` composes into feature-specific skeleton layouts (e.g. `features/chat/components/chat-message-skeleton.tsx`) passed to `PageLoader`'s `skeleton` prop.

### Patterns in Use

- **List item entrance**: track already-seen ids in a `useRef<Set<string>>`; wrap only genuinely new items in `Animated.View` with `entering={FadeInUp...}` (message list, public chat, announcements, search).
- **List reorder**: `Animated.View` with `layout={LinearTransition...}` on each row (chat list).
- **Pop-in badges/dots**: `Animated.View` with `entering={ZoomIn...}` and `motion.easing.emphasized` (unread badge, presence dot).
- **Status crossfade**: wrap the swapped content in `Crossfade` keyed on the status value.
- **Looping pulse**: `withRepeat(withSequence(withTiming(...), withTiming(...)), -1)` on a shared opacity value, frozen under reduced motion (skeleton shimmer, call banner pulse).
