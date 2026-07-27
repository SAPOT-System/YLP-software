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
  |     callerName,                    |                            |
  |     callId }                       |                            |
  |                                    |                            |
```

- WS payload uses `from_user`; TCP payload uses `from`
- `callerName` is the caller's `firstName + lastName` and is used for the incoming call notification and UI
- A local push notification is triggered on the callee's device (`incoming_call`)
- `ConnectionService.prepareCallSignaling()` prepares only the invitation transport: WS in server/auto mode, or TCP in LAN mode. It does not create an SDP offer or a WebRTC peer connection.
- `CallService` registers its `call-ready` handler before sending the invitation, so an immediate answer cannot race screen navigation or listener mounting.
- `callId` is carried through the incoming-call notification and returned by `call-ready`; a delayed ready signal from an older call is ignored.
- If both peers call each other at the same time, the app uses a deterministic peer-id tie-breaker so only one side stays on the incoming-call path and the other side resolves to `busy`

---

## 2. Callee Accepts

Callee sends `call-ready` back to the caller to signal they are ready for WebRTC negotiation.

```
Callee                          Server / Direct                  Caller
  |                                    |                            |
  |-- call-ready ----------------------|-- call-ready ------------->|
  |   { from/from_user, to, callId }   |                            |
```

The callee acquires local media, sends the correlated `call-ready`, and then waits for the caller to establish WebRTC. No SDP offer is sent before this acceptance.

---

## 3. WebRTC Negotiation

Once the matching `call-ready` is received, the caller's service-level handler starts WebRTC negotiation exactly once.

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

## 7. Reconnecting

`ConnectionService` emits `call-reconnecting` from two places:

- `WebrtcSessionManager` forwards the adapter's `ice-restarting` (ICE went
  `disconnected`/`failed`, or the liveness probe missed its pongs), and
- the adapter-eviction callback, when an adapter is evicted **for a retry**
  (`evictWebrtcAdapter(peerId, true)`) while `activeCallPeerId` matches.

Both fire during a plain connect retry too — i.e. while the call is still ringing and
has never been connected. `useCallLifecycle` therefore only enters `"reconnecting"` from
`"connected"` (or `"reconnecting"`); the event is ignored in every other state.

This is deliberate, not defensive: `"reconnecting"` has no exit path for a call that
never connected. Entering it from `"calling"` cancels the 30s no-answer timeout — armed
only while `callState === "calling"` — and once the connect retries are exhausted the
connect promise merely rejects into a logging `.catch`, so no further event resolves the
state and the room stays pinned on the "Reconnecting…" overlay. Ignoring the event keeps
the outgoing ring (and its no-answer terminal transition) in force, and stops a late
reconnect signal from resurrecting a terminal state such as `"rejected"`.

### Calling immediately after the network returns

A mobile WebSocket can temporarily keep `readyState === OPEN`, or retain an unresolved
`connectPromise`, after its underlying Wi-Fi interface disappears. If the caller starts a
new call immediately after reconnecting, writing the offer and `audio-call`/`video-call`
to that zombie transport silently loses them and both rooms remain in `"calling"`. The
heartbeat eventually detects the failure, but too late for that call attempt.

`NetworkConfig` therefore emits a distinct offline → online event even when the device
returns with the same IP address. `MainContainer` uses it to force a fresh signaling
WebSocket. The adapter invalidates and closes the old native socket while preserving the
outbound queue; messages created around the transition flush when the replacement socket
opens. The initial online event at app startup does not trigger this reset.

### Tearing down a call during an outage

While the WebSocket is down, `WsSignalingAdapter` buffers outbound frames in
`outboundQueue` (20s TTL) and flushes them on reconnect. During an outage the ICE-restart
machinery keeps generating offers and candidates, so that queue fills with SDP belonging
to a call that is about to be torn down. Flushing it after the socket returns replays
dead-session negotiation at the peer and corrupts whatever call is running by then — the
callee sits on an offer it can't complete while the caller retries into a broken session.

`CallService` invokes transport teardown for every active call session, including a
ringing attempt that never reached its internal `"connected"` state. Audio routing and
`InCallManager` cleanup remain limited to calls that actually connected.

`ConnectionService.terminateCallConnection()` therefore drops that peer's queued
`offer`/`answer`/`ice-candidate` frames (`discardQueuedNegotiationFor`) along with the
in-flight `connectingPeers` entry. `call-ended` and chat messages stay queued — those
still need to be delivered so the peer's call log finalizes.

Dropping the `connectingPeers` entry leaves the abandoned connect still running, so its
cleanup clears the entry **only if it is still its own**. Deleting unconditionally would
wipe a successor's registration, disabling de-duplication and letting two connects race
with competing offers — glare that wedges negotiation with both ends on "Calling…".

On the TCP leg the equivalent hazard is the adapter itself: `TcpClientAdapter` has no
keepalive or heartbeat, so `connectionState` only leaves `"connected"` on a socket
close/error that a vanished interface never delivers. `retryConnect` evicts the TCP
adapter alongside the WebRTC one so a retry rebuilds both legs instead of writing into a
dead socket — but only when it still holds an address to redial with. `retryConnect`
replays the original argument list, and `CallService.connect` falls back to
`connectToPeer(id)` with no ip/port whenever mDNS has not (re)discovered the peer.
Evicting there trades a working session for one `establishTcpForMode` cannot rebuild, so
it throws instead of retrying and the call never forms.

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
