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
