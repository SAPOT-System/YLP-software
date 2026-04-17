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
    "conversationId":   "string? — existing conversation ID"
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
    "conversationId":   "string? — existing conversation ID"
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
    "initiatorId":      "string?  — user ID of who ended the call"
  }
}
```

---

### `call-ready`
**Transport:** WebSocket + TCP &nbsp;|&nbsp; **Direction:** Sent & Received

> Sent by the callee to signal they are ready to begin WebRTC negotiation.

```json
{
  "type": "call-ready",
  "data": {
    "from_user / from": "string",
    "to":               "string"
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
**Transport:** WebRTC Data Channel &nbsp;|&nbsp; **Direction:** Sent & Received

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
| `messageType` | `string` | `"text"` \| `"file"` \| `"call_log"` |
| `endedAt` | `number` | Unix timestamp in milliseconds |
| `durationSeconds` | `number` | Integer seconds |
| `initiatorId` | `string` | User ID of who ended the call |

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
| `chat` | | | ✓ |
| `ack` | | | ✓ |
| `seen` | | | ✓ |
| `camera_toggle` | | | ✓ |
| `mic_toggle` | | | ✓ |

> **WebSocket** messages are server-relayed. **TCP** messages are direct peer-to-peer. WebSocket uses `from_user`; TCP uses `from`.
