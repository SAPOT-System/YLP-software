# GPS Location — Testing

## Strategy

| Layer       | Tooling                              | Scope                                                         |
|-------------|--------------------------------------|---------------------------------------------------------------|
| Unit        | Jest + React Native Testing Library  | `useGpsStreaming` lifecycle, `useLatestLocations` state updates, permission handling |
| Integration | pytest + HTTPX + WebSocket test client | gps.py WS handlers, UserLocation INSERT, broadcast, REST endpoints |
| E2E         | Maestro (simulator + mock GPS)       | Stream location → map marker appears; rescuer views history  |

---

## Coverage Targets

| Area                               | Target |
|------------------------------------|--------|
| gps.py WebSocket handlers          | 90%+   |
| REST endpoint scoping / role check | 100%   |
| `useGpsStreaming` lifecycle         | 100%   |
| Permission denied path             | 100%   |
| Broadcast fan-out logic            | 90%+   |
| Overall GPS feature coverage       | ≥ 80%  |

---

## Mocking Rules

- **expo-location** — mock `requestForegroundPermissionsAsync` and `watchPositionAsync`; never call real GPS API.
- **WebSocket (mobile)** — use a mock WebSocket class; intercept `send` calls.
- **Server DB** — pytest fixtures with an async SQLite in-memory database.
- **Server WS clients** — use FastAPI `TestClient` with `websocket_connect()` context manager.
- **Time** — use Jest fake timers for reconnect back-off; use `freezegun` for server-side timestamp assertions.

---

## Test Cases

### Server — WebSocket Streaming (pytest)

| Scenario | Expected result |
|----------|-----------------|
| User connects to `WS /gps/ws/{user_id}` with valid JWT | Connection accepted; user added to `streaming_connections` |
| User sends `{ "lat": 14.5995, "lng": 120.9842 }` | Row inserted in `user_locations` with correct user_id and timestamp |
| User sends malformed frame (missing `lng`) | Connection receives error frame; no DB write |
| User disconnects | Removed from `streaming_connections`; no error |
| Rescuer connects to monitor WS with valid rescuer JWT | Connection accepted; added to `monitor_connections` |
| Non-rescuer connects to monitor WS | Connection rejected with 403 |
| Streamer sends frame while rescuer monitor is connected | Rescuer monitor receives `{ user_id, lat, lng, timestamp }` within same request cycle |
| Multiple rescuer monitors connected | All monitors receive the broadcast frame |
| Rescuer monitor disconnects mid-broadcast | Remaining monitors still receive frame; no server crash |

### Server — REST Endpoints (pytest)

| Scenario | Expected result |
|----------|-----------------|
| `GET /gps/latest` as rescuer | Returns array with latest location per user; one entry per distinct user |
| `GET /gps/latest` as regular user | Returns 403 |
| `GET /gps/latest` with no locations in DB | Returns empty array `[]` |
| `GET /gps/history/{user_id}` as rescuer | Returns up to 50 rows ordered newest first |
| `GET /gps/history/{user_id}` with 60 rows in DB | Returns exactly 50 rows |
| `GET /gps/history/{user_id}` as regular user | Returns 403 |
| `GET /gps/history/{unknown_user_id}` | Returns empty array `[]` |

### Mobile — `useGpsStreaming` (Jest)

| Scenario | Expected result |
|----------|-----------------|
| Hook mounts with location permission granted | `watchPositionAsync` called; WebSocket `send` called on each position update |
| Hook unmounts | WebSocket `close()` called; `locationSub.remove()` called |
| Permission denied on mount | `permissionDenied` state set to `true`; WebSocket never opened |
| WebSocket closes unexpectedly | Reconnect attempted after 3 s; exponential back-off applied |
| Component unmounts before reconnect fires | Reconnect timer cleared; no further connection attempts |
| GPS update fires while WS is not yet open | Frame queued or skipped; no crash |

### Mobile — `useLatestLocations` (Jest)

| Scenario | Expected result |
|----------|-----------------|
| Hook mounts as rescuer | `GET /gps/latest` fetched; map state populated |
| Monitor WS receives location frame | `locations[user_id]` updated with new lat/lng |
| Hook unmounts | Monitor WS closed; no memory leak |
| Non-rescuer user | Hook not instantiated; `GET /gps/latest` never called |
| Monitor WS unavailable | Falls back to polling `GET /gps/latest` every 10 s |

### Integration — Full Location Frame Cycle (pytest)

| Scenario | Expected result |
|----------|-----------------|
| User streams 3 frames in sequence | 3 rows inserted in `user_locations` with increasing timestamps |
| Rescuer monitor open during streaming | Receives all 3 frames in order |
| `GET /gps/latest` after 3 frames | Returns 1 row per user with the latest timestamp |
| `GET /gps/history` after 3 frames | Returns all 3 rows ordered newest first |

---

## Test File Locations

```
server/
  tests/
    test_gps_ws.py
    test_gps_rest.py

mobile-app/sapot-mobile-app/
  src/
    features/gps/
      __tests__/
        useGpsStreaming.test.ts
        useLatestLocations.test.ts
```
