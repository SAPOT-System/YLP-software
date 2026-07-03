# Call Lifecycle

End-to-end sequence for audio and video calls.

---

## 1. Initiating a Call

The caller sends an `audio-call` or `video-call` message to the callee.

**Transport:** WebSocket (server mode / auto) or TCP (lan mode / auto fallback)

```
Caller                          Server / Direct                  Callee
  |                                    |                            |
  |-- audio-call / video-call -------->|-- audio-call / video-call->|
  |   { from/from_user, to,            |                            |
  |     conversationId?,               |                            |
  |     callerName }                   |                            |
  |                                    |                            |
```

- WS payload uses `from_user`; TCP payload uses `from`
- `callerName` is the caller's `firstName + lastName` and is used for the incoming call notification and UI
- A local push notification is triggered on the callee's device (`incoming_call`)
- If both peers call each other at the same time, the app uses a deterministic peer-id tie-breaker so only one side stays on the incoming-call path and the other side resolves to `busy`

---

## 2. Callee Accepts

Callee sends `call-ready` back to the caller to signal they are ready for WebRTC negotiation.

```
Callee                          Server / Direct                  Caller
  |                                    |                            |
  |-- call-ready ----------------------|-- call-ready ------------->|
  |   { from/from_user, to }           |                            |
```

---

## 3. WebRTC Negotiation

Once `call-ready` is received, the caller starts WebRTC negotiation.

```
Caller                          Server / Direct                  Callee
  |                                    |                            |
  |-- handshake (TCP only) ----------->|                            |
  |   { to, sender, ipAddress, port }  |                            |
  |                                    |                            |
  |-- offer --------------------------->|-- offer ----------------->|
  |   { to, sdp, sender,               |                            |
  |     ipAddress, port }              |                            |
  |                                    |                            |
  |<-- answer --------------------------|<-- answer ----------------|
  |   { to, sdp, sender,               |                            |
  |     ipAddress, port }              |                            |
  |                                    |                            |
  |<-> ice-candidate (multiple) ------>|<-> ice-candidate -------->|
  |   { to, candidate,                 |                            |
  |     sender, ipAddress, port }      |                            |
  |                                    |                            |
  |====== WebRTC peer connection established ======================|
  |          (media streams flow directly peer-to-peer)            |
```

- `handshake` is TCP-only — sent before the offer to exchange IP/port info
- `offer`, `answer`, `ice-candidate` travel via WS (relayed) or TCP (direct)

---

## 4. In-Call Control Messages

Sent over the **WebRTC data channel** (not WS/TCP) after the connection is established.

| Message | Trigger | Payload |
|---|---|---|
| `camera_toggle` | User toggles camera | `{ enabled: boolean, from: string }` |
| `mic_toggle` | User toggles mic | `{ enabled: boolean, from: string }` |

---

## 5. Ending a Call

Either party can end the call by sending `call-ended`.

```
Either peer                     Server / Direct               Other peer
  |                                    |                            |
  |-- call-ended ----------------------|-- call-ended ------------>|
  |   { from/from_user, to,            |                            |
  |     status, endedAt,               |                            |
  |     durationSeconds?, initiatorId? }                            |
```

`status` values:

| Value | Meaning |
|---|---|
| `completed` | Normal end after both connected |
| `missed` | Callee never answered |
| `rejected` | Callee explicitly declined |

---

## 6. Call Rejected / Missed

```
Callee (rejected)               Server / Direct                  Caller
  |-- call-rejected ------------------>|-- call-rejected --------->|
  |   { from/from_user, to,            |                            |
  |     reason: "declined" | "busy" }  |                            |

Caller (no answer timeout)      Server / Direct                  Callee
  |-- call-missed -------------------->|-- call-missed ----------->|
  |   { from/from_user, to,            |                            |
  |     reason: "no-answer" }          |                            |
```

When the callee declines, `CallService.rejectIncomingCall()` sends both `call-rejected`
(`reason: "declined"`) and, via `terminateCallConnection`, a follow-up `call-ended`
(`status: "rejected"`) — the latter carries the finalization metadata (`messageId`,
`durationSeconds`, etc.) the caller needs to close out its own call log entry. On the
caller's side, `CallMessageRouter` emits a dedicated `call-rejected` UI event for the
first message, and `useCallLifecycle` sets `callState` to `"rejected"` (shown as
"Call rejected"); the subsequent `call-ended` event still runs finalization but no
longer overwrites the UI state to the generic `"ended"` ("Call ended").

---

## Call Log Messages

When a call ends, `ChatService` saves a `MessageType.CALL_LOG` message to WatermelonDB for the conversation. The content is generated by `CallService.generateCallSummary()`:

| Outcome | Content format |
|---|---|
| Missed | `"Missed audio call"` / `"Missed video call"` |
| Completed | `"Audio call • MM:SS"` / `"Video call • MM:SS"` |

---

## Full Message Sequence Summary

```
audio-call / video-call   →  caller initiates
call-ready                →  callee accepts
handshake (TCP only)      →  TCP peer exchange
offer                     →  WebRTC negotiation start
answer                    →  WebRTC negotiation response
ice-candidate (N times)   →  ICE gathering
[WebRTC connected]
camera_toggle / mic_toggle →  in-call controls (WebRTC data channel)
call-ended                →  either party ends call
```

---

## Transport Quick Reference

| Message | Transport | Direction |
|---|---|---|
| `audio-call` / `video-call` | WS or TCP | Caller → Callee |
| `call-ready` | WS or TCP | Callee → Caller |
| `handshake` | TCP only | Caller → Callee |
| `offer` | WS or TCP | Caller → Callee |
| `answer` | WS or TCP | Callee → Caller |
| `ice-candidate` | WS or TCP | Both directions |
| `camera_toggle` / `mic_toggle` | WebRTC data channel | Both directions |
| `call-ended` | WS or TCP | Either party |
| `call-rejected` | WS or TCP | Callee → Caller |
| `call-missed` | WS or TCP | Caller → Callee |
