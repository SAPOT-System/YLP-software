# GPS Location — Requirements

## Overview

GPS location sharing uses a dedicated, server-mediated WebSocket layer independent of the messaging connection service. Any authenticated user can stream their coordinates; only rescuers can view live locations and history for all users.

---

## User Stories

| ID     | As a…    | I want to…                                               | So that…                                                   |
|--------|----------|----------------------------------------------------------|------------------------------------------------------------|
| GP-01  | rescuer  | see live locations of all users on a map                 | I can coordinate response and navigate to people in need   |
| GP-02  | user     | share my GPS location during an emergency                | Rescuers can find me even if I cannot communicate verbally  |
| GP-03  | rescuer  | view a user's location history                           | I can understand their movement and predict current position|
| GP-04  | rescuer  | see location updates refresh automatically               | I always have the most current position without manual refresh |
| GP-05  | user     | stop sharing my location when I choose                   | I retain control over my privacy                           |

---

## Functional Requirements

### FR-GP-01 — Location Streaming (Any User)

- Any authenticated user may stream their GPS location to the server.
- The mobile app opens a WebSocket connection to `WS /gps/ws/{user_id}?token=<JWT>`.
- The app sends location frames at a configurable interval (default 5 seconds):

  ```json
  { "lat": 14.5995, "lng": 120.9842 }
  ```

- The server saves each frame to the `UserLocation` table.
- The server broadcasts each frame to all connected rescuer monitors.

### FR-GP-02 — UserLocation Table

| Column    | Type    | Notes                         |
|-----------|---------|-------------------------------|
| id        | UUID    | Primary key                   |
| user_id   | UUID    | FK → users                    |
| latitude  | float   | Decimal degrees, WGS-84       |
| longitude | float   | Decimal degrees, WGS-84       |
| timestamp | datetime| Server-assigned UTC time of receipt |

### FR-GP-03 — Latest Locations (Rescuer Only)

- `GET /gps/latest` returns the single most-recent `UserLocation` row per user.
- Requires rescuer role (`UserStore.isRescuer === true`).
- Response is an array of `{ user_id, lat, lng, timestamp }` objects.
- Used by the map view to place markers for all users.

### FR-GP-04 — Location History (Rescuer Only)

- `GET /gps/history/{user_id}` returns the last 50 `UserLocation` rows for the specified user, ordered newest first.
- Requires rescuer role.
- Used by the history trail view on the map.

### FR-GP-05 — Rescuer Monitor WebSocket

- Rescuers open a separate WebSocket `WS /gps/ws/monitor/rescuers/{rescuer_id}?token=<JWT>` to receive live location broadcasts.
- The server pushes each new `UserLocation` frame to all connected rescuer monitors immediately after saving.
- Monitor connection is independent of the main messaging WebSocket.

### FR-GP-06 — Map Rendering

- The map view uses `@maplibre/maplibre-react-native` to render user location markers.
- Each marker displays the user's display name and last-seen timestamp.
- Tapping a marker opens the location history trail for that user.

### FR-GP-07 — Permission and Privacy

- **Streaming**: any authenticated user can stream their location (GP-01 through GP-05 above).
- **Viewing**: only rescuers may call `GET /gps/latest` and `GET /gps/history/{user_id}` and open the monitor WebSocket.
- Regular users do not see other users' locations.
- `UserStore.isRescuer` is evaluated client-side for UI gating; the server enforces the role check on every request.

### FR-GP-08 — GPS Reading

- The mobile app uses `expo-location` to read device GPS coordinates.
- The app requests `Location.requestForegroundPermissionsAsync()` before streaming begins.
- If permission is denied the streaming UI displays an explanation and a prompt to enable location in settings.
- Accuracy mode: `Location.Accuracy.Balanced` (conserves battery while suitable for emergency response).

---

## Non-Functional Requirements

| ID       | Requirement                                                               |
|----------|---------------------------------------------------------------------------|
| NFR-GP-01 | Location frame latency from device to rescuer monitor: ≤ 2 s on LAN    |
| NFR-GP-02 | Server must handle 50 concurrent streaming users without degradation     |
| NFR-GP-03 | GPS WebSocket must reconnect automatically after network interruption    |
| NFR-GP-04 | Location data must not be transmitted over unencrypted connections       |

---

## Out of Scope

- Offline map tiles (handled by the tileserver deployment; not part of this feature).
- Location sharing between regular users (rescuer-view only in v1).
- Geofencing or proximity alerts.
