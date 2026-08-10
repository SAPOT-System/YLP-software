# Connection Message Protocol

Reference for all messages exchanged between the mobile client and backend over WebSocket and TCP.

---

## Signaling Messages

Used to establish WebRTC connections between peers. Shapes are identical on both transports.


---

### `ice-candidate`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "ice-candidate",
  "data": {
    "to":        "string  — recipient user ID",
    "sender":    "string  — sender user ID",
    "ipAddress": "string  — sender's local LAN IP (e.g. 192.168.1.x)",
    "port":      "number  — sender's TCP listener port",
    "candidate": "RTCIceCandidate | null"
  }
}
```

---

### `offer`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "offer",
  "data": {
    "to":         "string",
    "sender":     "string",
    "ipAddress":  "string",
    "port":       "number",
    "sdp":        { "type": "offer", "sdp": "string — SDP body" },
    "iceRestart": "boolean? — true when renegotiating after ICE failure",
    "reason":     "string?  — human-readable renegotiation reason"
  }
}
```

---

### `answer`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "answer",
  "data": {
    "to":        "string",
    "sender":    "string",
    "ipAddress": "string",
    "port":      "number",
    "sdp":       { "type": "answer", "sdp": "string — SDP body" }
  }
}
```

---

### `handshake`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

> Sent first by the connecting peer before any WebRTC signaling. Used to exchange network info.

```json
{
  "type": "handshake",
  "data": {
    "to":        "string",
    "sender":    "string",
    "ipAddress": "string",
    "port":      "number"
  }
}
```

---

## Call Messages

Used to signal call lifecycle events between peers.

> **Field naming by direction:**
> - `from_user` — used when the **server sends the message to the peer** (WebSocket server → mobile client)
> - `from` — used when the **mobile app sends the message to the server** (mobile client → WebSocket server) and on **TCP** (direct peer-to-peer)
>
> In other words: if you're receiving a call event pushed by the server, expect `from_user`. If you're sending a call event from the app, use `from`.

---

### `audio-call`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "audio-call",
  "data": {
    "from_user / from": "string  — caller user ID",
    "to":               "string  — callee user ID",
    "conversationId":   "string? — existing conversation ID",
    "callerName":       "string  — caller's display name (firstName + lastName)"
  }
}
```

---

### `video-call`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "video-call",
  "data": {
    "from_user / from": "string  — caller user ID",
    "to":               "string  — callee user ID",
    "conversationId":   "string? — existing conversation ID",
    "callerName":       "string  — caller's display name (firstName + lastName)"
  }
}
```

---

### `call-ended`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "call-ended",
  "data": {
    "from_user / from": "string",
    "to":               "string",
    "status":           "\"completed\" | \"missed\" | \"rejected\" | undefined",
    "endedAt":          "number?  — Unix timestamp (ms)",
    "durationSeconds":  "number?  — call duration in seconds",
    "initiatorId":      "string?  — user ID of who ended the call",
    "messageId":        "string?  — database ID of the call log message saved locally by the sender"
  }
}
```

---

### `call-ready`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

> Sent by the callee after accepting. The caller begins WebRTC negotiation only when `callId` matches its active session.

```json
{
  "type": "call-ready",
  "data": {
    "from_user / from": "string",
    "to":               "string",
    "callId":           "string  — active call session ID"
  }
}
```

---

### `call-rejected`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "call-rejected",
  "data": {
    "from_user / from": "string",
    "to":               "string",
    "reason":           "\"declined\" | \"busy\" | undefined"
  }
}
```

---

### `call-missed`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "call-missed",
  "data": {
    "from_user / from": "string",
    "to":               "string",
    "reason":           "\"no-answer\" | undefined"
  }
}
```

---

## WebRTC Data Channel

Sent and received directly between peers after WebRTC connection is established. **No server involvement.**

---

### `chat`
**Transport:** WebRTC Data Channel &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "chat",
  "data": {
    "messageId":      "string — UUID",
    "conversationId": "string — UUID",
    "from":           "string — sender user ID",
    "to":             "string — recipient user ID",
    "message":        "string — message content",
    "sentAt":         "Date   — ISO 8601 timestamp",
    "messageType":    "\"text\" | \"file\" | \"call_log\"",
    "senderProfile": {
      "username":  "string",
      "firstName": "string",
      "lastName":  "string?"
    }
  }
}
```

---

### `ack` — delivery acknowledgement
**Transport:** WebRTC Data Channel &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "ack",
  "data": {
    "messageId": "string — UUID of the acknowledged message",
    "from":      "string",
    "to":        "string"
  }
}
```

---

### `seen` — read receipt
**Transport:** WebRTC Data Channel or WebSocket relay &nbsp;|&nbsp; **Direction:** Sent & Received

> Admin conversations use the WebSocket relay and never establish WebRTC.

```json
{
  "type": "seen",
  "data": {
    "conversationId": "string",
    "from":           "string",
    "to":             "string"
  }
}
```

---

### `camera_toggle` / `mic_toggle`
**Transport:** WebRTC Data Channel &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "camera_toggle" | "mic_toggle",
  "data": {
    "enabled": "boolean",
    "from":    "string"
  }
}
```

### `ping` / `pong` — liveness probe
**Transport:** WebRTC Data Channel &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "ping" | "pong",
  "data": { "nonce": "number" }
}
```

Application-level liveness check, implemented by `LivenessMonitor` and driven by `WebrtcAdapter`
through injected closures (`send`, `onLivenessLost`, `onLivenessRestored`). Because
`RTCPeerConnection.connectionState === "connected"` can lie after a Wi-Fi flap
(the link is half-open / stale), each peer pings every 4 s and expects a `pong`
with the same `nonce` within 3 s. Two consecutive missed pongs force an ICE
restart; a pong received while the adapter is in a degraded / ICE-restarting
state is treated as authoritative proof the peer is reachable again and emits
`peer-reconnected` upstream — this is what resolves a one-sided "Reconnecting…"
status where the ICE state machine never re-reported "connected". These frames
are intercepted inside the adapter and never propagate to chat handling.

---

## Server-Relay Messages

These exist only on the WebSocket link to the server — they have no TCP or data-channel
equivalent.

### `profile-info`
**Transport:** TCP, WebSocket &nbsp;|&nbsp; **Direction:** Sent & Received

```json
{
  "type": "profile-info",
  "data": {
    "from":      "string",
    "username":  "string",
    "firstName": "string",
    "lastName":  "string?"
  }
}
```

Display-name exchange. Part of the `Message` union alongside signaling and call messages, so it
travels over the same TCP/WS paths. This is how a peer's name is learned when it is not already in
the local `peers` table (notably guests, which are never server-registered).

---

### `server-ack`
**Transport:** WebSocket &nbsp;|&nbsp; **Direction:** Received

```json
{
  "type": "server-ack",
  "data": {
    "message_type": "chat" | "call-ended" | "ack" | "seen",
    "messageId":    "string",
    "from":         "string",
    "to":           "string"
  }
}
```

The relay confirming it accepted a frame for forwarding. Note this is **weaker than the peer-level
`ack`**: it means the server took the message, not that the recipient received it. Only the
peer's `ack` proves delivery.

---

### `get-active-users`
**Transport:** WebSocket &nbsp;|&nbsp; **Direction:** Sent

```json
{ "type": "get-active-users" }
```

Presence poll. `ActiveUsersService` sends it and listens for the adapter's `active-users` event,
re-polling every 10 s. Payload-free — the response is a list of connected user IDs.

---

### `public-chat`
**Transport:** WebSocket &nbsp;|&nbsp; **Direction:** Sent & Received

Broadcast channel, separate from P2P chat. History comes from `GET /public-chat`
(see [API.md](API.md#public-chat--public-chat)); live messages arrive over this frame.

---

### `chat` with `messageType: "sms"`
**Transport:** WebSocket &nbsp;|&nbsp; **Direction:** Received

A `chat` frame whose `data.messageType` is `"sms"` rather than `"text"`/`"file"`/`"call_log"`. It
is delivered by the GSM gateway on behalf of someone reachable only by SMS, and carries the same
`senderProfile` shape as a normal chat message. Handle it as an inbound chat message whose sender
may not be a registered peer.

---

## Field Reference

| Field | Type | Notes |
|---|---|---|
| `to` | `string` | Recipient user ID |
| `from` | `string` | Sender user ID — used in TCP and WebRTC |
| `from_user` | `string` | Sender user ID — used in WebSocket only |
| `sender` | `string` | Sender user ID — signaling messages only, same value as `from` |
| `ipAddress` | `string` | Sender's local LAN IP |
| `port` | `number` | Sender's TCP listener port |
| `conversationId` | `string` | UUID of the conversation |
| `status` | `string` | `"completed"` \| `"missed"` \| `"rejected"` |
| `reason` (call-rejected) | `string` | `"declined"` \| `"busy"` |
| `reason` (call-missed) | `string` | `"no-answer"` |
| `messageType` | `string` | `"text"` \| `"file"` \| `"call_log"`, plus `"sms"` on GSM-relayed `chat` frames |
| `endedAt` | `number` | Unix timestamp in milliseconds |
| `durationSeconds` | `number` | Integer seconds |
| `initiatorId` | `string` | User ID of who ended the call |
| `callerName` | `string` | Caller's display name — included in `audio-call` and `video-call` |

---

## Transport Summary

| Message | WebSocket | TCP | WebRTC |
|---|:---:|:---:|:---:|
| `ice-candidate` | ✓ | ✓ | |
| `offer` | ✓ | ✓ | |
| `answer` | ✓ | ✓ | |
| `handshake` | ✓ | ✓ | |
| `audio-call` | ✓ | ✓ | |
| `video-call` | ✓ | ✓ | |
| `call-ended` | ✓ | ✓ | |
| `call-ready` | ✓ | ✓ | |
| `call-rejected` | ✓ | ✓ | |
| `call-missed` | ✓ | ✓ | |
| `chat` | ✓ | | ✓ |
| `ack` | ✓ | | ✓ |
| `seen` | ✓ | | ✓ |
| `camera_toggle` | | | ✓ |
| `mic_toggle` | | | ✓ |
| `ping` | | | ✓ |
| `pong` | | | ✓ |
| `profile-info` | ✓ | ✓ | |
| `server-ack` | | ✓ | |
| `get-active-users` | | ✓ | |
| `public-chat` | | ✓ | |

> **WebSocket** messages are server-relayed. **TCP** messages are direct peer-to-peer. WebSocket uses `from_user`; TCP uses `from`.
