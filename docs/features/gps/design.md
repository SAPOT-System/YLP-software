# GPS Location — Design

## Overview

GPS location sharing uses a dedicated WebSocket layer that is fully independent of the messaging `ConnectionService`. Any user can stream coordinates; only rescuers can view them. The server saves every frame to `UserLocation` and forwards it to all connected rescuer monitors in real time.

GPS streaming is server-mediated only — a dedicated `/gps/ws/<id>` WebSocket, gated by `UserStore.isRescuer` — and intentionally has no P2P path.

---

## Architecture

```
Mobile (any user)                      Server (gps.py)            Mobile (rescuer)
─────────────────                      ───────────────            ─────────────────
useGpsStreaming hook
  expo-location ──── WS /gps/ws/{uid} ──►  save UserLocation
                                            broadcast ──────────► WS /gps/ws/monitor/rescuers/{id}
                                                                  useLatestLocations hook
                                                                  @maplibre map view
                                       ◄── GET /gps/latest ──────┤
                                       ◄── GET /gps/history/{id} ┤
```

---

## Mobile — Hooks

### `useGpsStreaming`

Responsible for acquiring location permission, reading GPS coordinates, and streaming them to the server.

```typescript
// Lifecycle
useEffect(() => {
  let ws: WebSocket | null = null
  let locationSub: Location.LocationSubscription | null = null

  async function start() {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') { setPermissionDenied(true); return }

    ws = new WebSocket(`ws://${serverHost}/gps/ws/${userId}?token=${jwt}`)
    ws.onopen = () => {
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 5000 },
        (loc) => ws?.send(JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      )
    }
    ws.onclose = () => { /* reconnect with back-off */ }
  }

  start()
  return () => { ws?.close(); locationSub?.remove() }
}, [userId, jwt])
```

Key behaviours:
- Connects on mount; disconnects on unmount (cleanup function).
- Handles `permissionDenied` state to show a settings-redirect prompt.
- Reconnects automatically on close with 3 s → 6 s → 12 s back-off.
- Does not reconnect if the component has unmounted.

### `useLatestLocations` (rescuer only)

Polls `GET /gps/latest` on mount and subscribes to the monitor WebSocket for live updates.

```typescript
// On mount
fetchLatestLocations()  // initial map population

// Monitor WebSocket receives { user_id, lat, lng, timestamp }
monitorWs.onmessage = (e) => {
  const frame = JSON.parse(e.data)
  setLocations(prev => ({ ...prev, [frame.user_id]: frame }))
}
```

- Falls back to polling every 10 s if the WebSocket is unavailable.
- Only rendered/instantiated when `UserStore.isRescuer === true`.

---

## Server — `server/app/api/gps.py`

### WebSocket Endpoints

| Path                              | Role       | Direction      | Description                           |
|-----------------------------------|------------|----------------|---------------------------------------|
| `/gps/ws/{user_id}?token=JWT`     | Any user   | client → server| Receive location frames; save + relay |
| `/gps/ws/monitor/rescuers/{id}?token=JWT` | Rescuer | server → client | Push live location frames             |

### Connection Manager

`gps.py` maintains two in-memory sets:
- `streaming_connections: dict[user_id, WebSocket]` — active user streamers.
- `monitor_connections: set[WebSocket]` — active rescuer monitors.

On each incoming frame from a streamer:
1. Validate frame schema `{ lat: float, lng: float }`.
2. Insert row into `UserLocation` (async DB write).
3. Broadcast `{ user_id, lat, lng, timestamp }` to all entries in `monitor_connections`.

### REST Endpoints

| Method | Path                    | Auth    | Description                            |
|--------|-------------------------|---------|----------------------------------------|
| GET    | `/gps/latest`           | Rescuer | Latest location per user               |
| GET    | `/gps/history/{user_id}`| Rescuer | Last 50 rows for user, newest first    |

Both endpoints check `current_user.role == 'rescuer'`; return 403 otherwise.

### `GET /gps/latest` Query

```sql
SELECT DISTINCT ON (user_id) *
FROM user_locations
ORDER BY user_id, timestamp DESC;
```

### `GET /gps/history/{user_id}` Query

```sql
SELECT * FROM user_locations
WHERE user_id = :user_id
ORDER BY timestamp DESC
LIMIT 50;
```

---

## Data Flow — Single Location Frame

```
1. expo-location fires watchPositionAsync callback
2. useGpsStreaming sends { lat, lng } over WS /gps/ws/{user_id}
3. gps.py receives frame; validates schema
4. Async INSERT into user_locations table
5. gps.py iterates monitor_connections; sends { user_id, lat, lng, timestamp }
6. useLatestLocations receives frame; updates map marker state
7. @maplibre map re-renders marker at new position
```

---

## Independence from ConnectionService

The GPS WebSocket is managed entirely within `useGpsStreaming` and `gps.py`. It:
- Uses a separate WebSocket URL path (`/gps/ws/*` vs `/ws`).
- Has its own reconnection logic independent of `ConnectionService`.
- Does not share state with the messaging or signalling layers.
- Can remain connected even if the messaging WebSocket is disconnected.

---

## Dependencies

| Library / Component             | Purpose                                          |
|---------------------------------|--------------------------------------------------|
| expo-location                   | Read device GPS coordinates                      |
| @maplibre/maplibre-react-native | Render map tiles and user location markers       |
| FastAPI WebSocket (`gps.py`)    | Server-side WS connection management             |
| SQLAlchemy async                | Async `UserLocation` INSERT                      |
| MariaDB `user_locations` table  | Authoritative location store                     |

---

## Non-goals

- No offline/local GPS history for streaming users — location frames are sent live and stored server-side; a streaming user does not retain their own history locally beyond what the OS/app session already has in memory.
- No geofencing, alerts, or automated notifications based on location — this feature is visualization only.
- No historical playback/route replay UI — `GET /gps/history/{user_id}` returns raw rows; there's no timeline scrubber or animated route in this feature's scope.
- GPS sharing is server-mediated only by design — there is intentionally no P2P GPS path, unlike messaging/calls (see [Independence from ConnectionService](#independence-from-connectionservice)).

## Failure handling

- **Location permission denied:** `useGpsStreaming` sets `permissionDenied` and does not attempt to connect the WebSocket — per the mobile app's permission-state convention, the UI must render a distinct denied state, not silently do nothing.
- **WebSocket disconnects mid-stream:** automatic reconnect with exponential back-off (3s → 6s → 12s); location updates are simply not delivered during the gap — there is no local buffering/replay of missed frames once reconnected.
- **Monitor WebSocket (rescuer side) unavailable:** `useLatestLocations` falls back to polling `GET /gps/latest` every 10s, so rescuers still get updates (at lower frequency) if the live push channel is down.
- **Non-rescuer calls a rescuer-only endpoint:** `GET /gps/latest`/`GET /gps/history/{user_id}` return 403; the mobile app must never render these views for a non-rescuer regardless of what the UI attempts to request.
- **Malformed location frame from a streamer:** the server validates the frame schema before insert; a frame missing `lat`/`lng` is rejected rather than partially stored.

## Performance impact

- Location frames are sent at a fixed 5-second interval per streaming user (`timeInterval: 5000` in `watchPositionAsync`) — total server ingest load scales linearly with the number of concurrently streaming users, not message/call volume.
- Each frame triggers one async DB insert and a broadcast to all connected monitors — broadcast cost scales with `monitor_connections` count (number of online rescuers), not streamer count, since it's a fan-out per frame.
- `Accuracy.Balanced` (rather than `Highest`) is used deliberately to reduce GPS hardware power draw and location-fix latency, at some cost to positional precision — reasonable for map-marker-level situational awareness, not survey-grade tracking.

## Scalability

- Server-side broadcast is O(streamers × monitors) per interval in the worst case (every streamer's frame reaches every monitor) — at LAN incident-site scale (per [system-overview.md](../../architecture/system-overview.md)) this is a small constant, but it would not scale to a large multi-site deployment without partitioning monitors by geographic/organizational scope.
- `user_locations` grows unboundedly with every frame from every streaming session — no retention/pruning policy exists; `GET /gps/history/{user_id}` mitigates unbounded *query* cost with a `LIMIT 50`, but the table itself keeps growing.
- In-memory `streaming_connections`/`monitor_connections` dicts mean GPS state is not shared across multiple server instances — this feature assumes a single server process, consistent with the rest of the deployment model.

## Acceptance criteria

- A rescuer sees a streaming user's location update on the map within one broadcast cycle of the user's device sending it (nominal case: within ~5 seconds).
- A non-rescuer cannot access any rescuer-only GPS endpoint or WebSocket, even with a valid JWT.
- Location streaming stops immediately when the streaming component unmounts (no orphaned WebSocket or location subscription).
- If the live monitor WebSocket is unavailable, a rescuer still receives location updates via polling within 10 seconds.
- Denying location permission produces a clear in-app prompt to enable it, not a silent failure to stream.
