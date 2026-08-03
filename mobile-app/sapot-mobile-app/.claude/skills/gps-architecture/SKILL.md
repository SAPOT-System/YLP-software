# gps-architecture

## Description

Architecture reference for the GPS location sharing feature (`features/gps/`). GPS uses a dedicated WebSocket channel entirely separate from the P2P `ConnectionService`. This skill documents the hooks, context, and data flow so you know what exists before adding anything new to the feature.

## Usage

Invoke this skill when:
- Adding or modifying GPS location sharing behavior
- Working on the map screen or location rendering
- Modifying how location preferences are persisted
- Debugging why location updates are not flowing or not displaying

## Architecture Overview

GPS does **not** go through `ConnectionService`. It has its own dedicated WebSocket to the server and its own React hooks and context. Changes to `ConnectionService` do not affect GPS, and vice versa.

```
AuthProvider
  └── UserStore.isRescuer  ← gates whether GPS runs at all
        └── useGpsStreaming
              └── GpsLocationService  → WebSocket /gps/ws/<userId>
                                            streams { lat, lng }

Map screen
  ├── useLatestLocations   → GET /gps/latest (polled every 5s via React Query)
  │     └── renders other rescuers on @maplibre/maplibre-react-native map
  └── useTileServerStatus  → GET <tileserver>/styles/basic-preview/style.json
        └── (polled every 30s) drives the "map tiles unavailable" banner

GpsPreferenceProvider
  └── GpsPreferenceContext  → expo-secure-store key: gps_sharing_enabled
        └── read by useGpsStreaming to honour user toggle
```

## Hook and Context Reference

### `useGpsStreaming`

**File:** `features/gps/hooks/useGpsStreaming.ts`

Starts and stops `GpsLocationService` based on two conditions:
1. User is authenticated and is not a guest.
2. User has enabled location sharing (`GpsPreferenceContext`).

Only activates for rescuers (`UserStore.isRescuer === true`). Use this hook at the top-level provider level — do not call it inside individual screens.

### `useLatestLocations`

**File:** `features/gps/hooks/useLatestLocations.ts`

Polls `GET /gps/latest` every 5 seconds using React Query. Returns the most recent `{ lat, lng }` for all active rescuers. Used by the map screen to render peer location pins.

Each entry also carries `role` (`admin` | `rescuer` | `user`). The map screen maps that to a marker icon and colour via `features/gps/utils/resolve-role-marker.ts` — use that resolver rather than branching on the role string inline, so the marker and the legend stay in sync.

Do not call this hook in a component that unmounts frequently — the 5s interval is managed by React Query's `refetchInterval` and is shared across consumers.

### `useTileServerStatus`

**File:** `features/gps/hooks/useTileServerStatus.ts` (probe in `features/gps/api/tileserver.api.ts`)

Takes the tileserver base URL as an argument — the same value the map built its
tile URL from. It does **not** call `getTileServerUrl()` itself: the map screen
freezes its tile URL at mount, while the host override can be changed mid-session
from the drawer, so resolving it inside the probe would let the banner report on
a different host than the one being rendered.

Polls the tileserver's basemap style every 30 seconds and reports `isUnavailable`.
The tileserver is a **separate deployment** from the API (`tileserver/`), so it
can be down while `/gps/latest` is healthy — and `@maplibre/maplibre-react-native`
exposes **no error event for failed tiles** (`onDidFailLoadingMap` only covers the
map style, which the screen supplies inline). Without this probe a dead tileserver
renders as a silent blank canvas.

`isUnavailable` stays `false` until the first probe resolves, so the banner never
appears before the tileserver has actually been asked.

### `GpsPreferenceContext` / `GpsPreferenceProvider`

**File:** `features/gps/context/GpsPreferenceContext.ts`

Persists the user's location-sharing toggle to `expo-secure-store` under the key `gps_sharing_enabled`. Provides a boolean and a setter.

**Usage rule:** Wrap any screen or provider that reads or sets the sharing toggle with `GpsPreferenceProvider`. Do not read from `expo-secure-store` directly using the key `gps_sharing_enabled` — always go through context.

## Decision Rules

- **New GPS data to stream** → extend `GpsLocationService`; do not open a second WebSocket.
- **New location-derived UI** → use `useLatestLocations`; do not poll `/gps/latest` directly from a component.
- **New location preference** → extend `GpsPreferenceContext`; do not add a second secure-store key for GPS preferences.
- **Map library** → `@maplibre/maplibre-react-native` is the chosen library. Do not import `react-native-maps` or any other map package.
- **Basemap/tile failure UI** → use `useTileServerStatus`; do not try to detect it from a MapLibre callback, there isn't one.

## Expected Output

When asked to add a new field to the GPS stream (e.g. heading):
→ Point to `GpsLocationService`, show where `{ lat, lng }` is produced, and explain how to extend the payload and the server endpoint together.

When asked why GPS is not starting for a user:
→ Check `UserStore.isRescuer`, `GpsPreferenceContext` value, and whether the user is authenticated and non-guest — those are the three gates in `useGpsStreaming`.

When asked to add a new map layer:
→ Confirm `@maplibre/maplibre-react-native` is the correct library and point to the existing map screen for the rendering pattern.
