# GPS API

Machine-readable spec: [`openapi/gps.yaml`](openapi/gps.yaml) (generated from the live FastAPI app — REST routes only; WebSocket routes are not representable in OpenAPI and are documented in prose below). Note: neither REST route declares a `response_model`, so the generated YAML's `200` response schema is empty (`{}`) — the JSON examples below are the only documented shape for these responses.

GPS endpoints stream and query user location data (router in `server/app/api/gps.py`, prefix `/gps`). REST endpoints use JWT Bearer auth. WebSocket routes use the `sapot.jwt` subprotocol contract.

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| WS | `/gps/ws/{user_id}` | `Sec-WebSocket-Protocol: sapot.jwt, <JWT>` | Stream live GPS coordinates from a user's device; server persists and fans out to monitoring rescuers. |
| WS | `/gps/ws/monitor/rescuers/{rescuer_id}` | `Sec-WebSocket-Protocol: sapot.jwt, <JWT>`; rescuer role | Live feed of every user's GPS updates, for rescuers. |
| GET | `/gps/latest` | JWT Bearer (rescuer role) | Most recent location for every user who has sent at least one ping. |
| GET | `/gps/history/{user_id}` | JWT Bearer (rescuer role) | Location history for a specific user, most recent first. |

---

## WebSocket /gps/ws/{user_id}

Stream live GPS coordinates from a user's device to the server. The server persists each ping and fans out to all monitoring rescuers in real time.

**Auth:** ordered WebSocket subprotocol offer `sapot.jwt`, then the access token

```javascript
const socket = new WebSocket("wss://<host>/gps/ws/<user_uuid>", [
  "sapot.jwt",
  accessToken,
]);
```

**Validation:**
- The authenticated user must match `user_id` in the path (closes with code 1008 otherwise).
- `user_id` must correspond to an existing user (closes with code 4004 if not found).

**Inbound message (client to server):**

```json
{ "lat": 14.0000, "lng": 120.0000 }
```

**On each message the server:**
1. Creates a `UserLocation` record in the database.
2. Broadcasts the location to all connected rescuers.

**Broadcast payload (sent to rescuers):**

```json
{
  "user_id": "<uuid>",
  "latitude": 14.0000,
  "longitude": 120.0000,
  "timestamp": "2026-06-28T12:00:00+00:00",
  "username": "jdoe",
  "role": "user"
}
```

`role` is one of `admin`, `rescuer`, or `user` — the same vocabulary the chat
role badge uses. Map clients render rescuer markers distinctly from regular
users based on this field.

---

## WebSocket /gps/ws/monitor/rescuers/{rescuer_id}

Open a live feed of all users' GPS updates. Rescuers only.

**Auth:** ordered WebSocket subprotocol offer `sapot.jwt`, then the access token

```javascript
const socket = new WebSocket(
  "wss://<host>/gps/ws/monitor/rescuers/<rescuer_uuid>",
  ["sapot.jwt", accessToken],
);
```

**Validation:**
- Authenticated user must match `rescuer_id` in the path.
- User must hold the `rescuer` role.
- Both checks enforce code 1008 on failure.

**Outbound messages:** Each GPS ping from any user is forwarded to all monitoring rescuers (same payload as the broadcast above).

The connection stays open; the client does not need to send anything.

---

## GET /gps/latest

Return the most recent location for every user who has sent at least one GPS ping. Used for the initial map load.

**Auth:** JWT Bearer (rescuer role required)

**Response 200:**

```json
[
  {
    "user_id": "<uuid>",
    "latitude": 14.0000,
    "longitude": 120.0000,
    "timestamp": "2026-06-28T12:00:00+00:00",
    "username": "jdoe",
    "role": "rescuer"
  }
]
```

`role` is one of `admin`, `rescuer`, or `user`.

---

## GET /gps/history/{user_id}

Return the location history for a specific user, most recent first.

**Auth:** JWT Bearer (rescuer role required)

**Path params:** `user_id` — UUID of the user

**Query params:** `limit` — integer, default `50`

**Response 200:**

```json
[
  {
    "id": "<uuid>",
    "user_id": "<uuid>",
    "latitude": 14.0000,
    "longitude": 120.0000,
    "timestamp": "2026-06-28T12:00:00+00:00"
  }
]
```

**Errors:**
- `404` — no location history found for this user
