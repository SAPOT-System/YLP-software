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

## 6b. Minimizing

Both the active call room and the incoming (ringing) call screen can be minimized instead
of torn down — either via the on-screen chevron or the Android hardware back button.

**Active call room** (`app/(drawer)/(tabs)/call/[id].tsx`): a `BackHandler` intercepts
hardware back and calls the same `minimize()` used by the on-screen chevron whenever
`callState` is `"calling"`, `"connected"`, or `"reconnecting"` — i.e. whenever a call is
live or being established. In every other (terminal) state, back falls through to the
default screen pop since there is no live call to strand.

**Incoming (ringing) call** (`app/(drawer)/(tabs)/call/incoming.tsx`): previously had no
minimize path — the 30s no-answer timeout and the caller-cancel listener lived in the
screen's own `useFocusEffect`/`useEffect`, so navigating away tore them down and silently
dropped the ring. That lifecycle now lives in `CallContext` via
`useIncomingCallLifecycle`, keyed off `incomingCall` state (`peerId`, `callType`,
`conversationId`, `callId`, `callerName`), so it survives the screen being minimized or
unmounted — mirroring how `useCallLifecycle` already outlives the call room once a call is
under way. The incoming-call screen registers itself into `incomingCall` on mount, exposes
a minimize chevron, and routes hardware back through `minimizeIncoming()` unconditionally
(no accept/reject state to guard against, unlike the active call room).

In both cases, minimizing sets `isMinimized` and navigates back to the tab root;
`CallBanner` renders a compact banner while minimized and un-minimizes on tap:

- **Active call** — banner shows peer avatar/name, live duration or "Calling…", and an
  end-call button. Tapping (outside the end-call button) calls `maximize()` and
  re-navigates to the call room.
- **Ringing call** (`isRinging = isMinimized && incomingCall != null`) — banner shows the
  caller's name and "Incoming call…", with no avatar pulse and no accept/reject controls
  (those only exist on the full incoming-call screen). Tapping calls `maximizeIncoming()`,
  which re-navigates to `call/incoming` with the stored `incomingCall` params.

The no-answer timeout and caller-cancel listener keep running regardless of whether the
ringing call is minimized or foregrounded; both call `onIncomingCallEnded()` (clears
`incomingCall` and navigates to the tab root) when they fire.

### Ring registration is one-shot

`call/incoming` lives in a bottom-tab navigator, which never unmounts a screen it has
already rendered — answering, rejecting, or minimizing only blurs it. Its registration
effect therefore keeps running for the rest of the session, and would re-fire the moment
`clearIncomingCall()` sets `incomingCall` back to `null`. The screen guards against this
with a ref keyed on the ring identity (`peerId` + `callId`), registering each ring at most
once, so a ring that was accepted, rejected, or cancelled stays cleared. Without the guard
the resurrected ring re-arms its 30s no-answer timeout, which fires
`markMissedIncomingCall()` mid-conversation and tears down the *live* call, and flips
`CallBanner` back to its "Incoming call…" variant (no end-call button, and tapping it
returns to accept/reject instead of the call room). A genuinely new ring carries a new
`callId`, so it still registers normally.

### Entering the call room does not discard live media

The call room runs `resetCallState()` on focus for `status=calling` and
`status=answering`, which clears the lifecycle, timer and streams so state from a previous
call cannot bleed into a new one. On the answering path the call is already under way by
then — `handleAccept` awaits `answerCall()` (which negotiates WebRTC) *before* navigating —
so the remote stream can arrive before the room ever mounts.

`remoteStream` is edge-triggered and never replayed, so a reset that simply cleared it
would strand a live call on `"calling"` with no video until the 30s no-answer timeout tore
it down. `CallService` therefore retains the stream of the call under way
(`getRemoteStream()`), cleared both when a call terminates and when a new session starts,
and `useRemoteStream`'s reset re-reads it instead of discarding it — re-adopting it also
re-fires `onConnected()`, so `callState` ends the batch on `"connected"`. This mirrors how
local media already works: `useLocalStream` re-reads `callService.getLocalCam(peerId)`
rather than depending on having caught an event.

### Caller name on the notification path

An incoming call reaches `call/incoming` from two places: the `audio-call`/`video-call`
connection event (`IncomingCallListener` in `app/(drawer)/(tabs)/_layout.tsx`) and the
incoming-call notification (`app/(drawer)/_layout.tsx`). With the app foregrounded both
fire, and because navigating to an already-visited tab route *replaces* its params rather
than merging them, the second one wins. Both paths must therefore carry `callerName` —
which means `NotificationService.showCallAlert` has to put `caller_name` in the
notification `data` payload for the notification path to have it at all.

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

### Who owns the busy marker

`ConnectionService.activeCallPeerId` is the single field every incoming call is checked
against (`shouldBusyRejectIncomingCall`). While it is set, a call from any other peer is
auto-rejected as busy before the device ever rings, so a marker that outlives its call
silently blocks the next one.

Ownership passes along the call: `useIncomingCallLifecycle` claims it while ringing and
releases it when the ring ends, *unless* `CallService` has meanwhile opened a session for
that peer — answering hands ownership to the session, which holds the marker until the
call ends. `CallService` releases it from a `finally` on every teardown path, so a failure
while persisting the call log or notifying the peer cannot take the release down with it.

Release goes through `clearActiveCall(peerId)`, which is a no-op unless that peer still
owns the marker. An unconditional `setActiveCall(null)` would let one peer's teardown
un-busy a call that is still live with another peer.

Retiring the `CallSession` is likewise unconditional: `finalizeSession` marks and deletes
it in a `finally`, treating persistence as best-effort. A session left unfinalized is
handed back by the next `ensureSession()`, so the following call would reuse the dead
call's id and discard its own correlated `call-ready` as stale.

### Tearing down a call during an outage

While the WebSocket is down, `WsSignalingAdapter` buffers outbound frames in
`outboundQueue` (20s TTL) and flushes them on reconnect. During an outage the ICE-restart
machinery keeps generating offers and candidates, so that queue fills with SDP belonging
to a call that is about to be torn down. Flushing it after the socket returns replays
dead-session negotiation at the peer and corrupts whatever call is running by then — the
callee sits on an offer it can't complete while the caller retries into a broken session.

`CallService` invokes transport teardown for every active call session, including a
ringing attempt that never reached its internal `"connected"` state. Audio routing and
`InCallManager` cleanup follow the peers recorded in `audioSessionPeers` — the audio
session starts during setup, well before the call connects, so "reached connected" is not
a safe proxy for "has a session to stop".

`ConnectionService.terminateCallConnection()` therefore drops that peer's queued
`offer`/`answer`/`ice-candidate` frames (`discardQueuedNegotiationFor`) along with the
in-flight `connectingPeers` entry. `call-ended` and chat messages stay queued — those
still need to be delivered so the peer's call log finalizes.

Each of those release steps is independent and independently fallible, so one failure
must not strand the rest. `terminateCall()` has already disposed the `WebrtcAdapter` by
the time it can throw, and an adapter left in the session map after disposal is handed
straight to the next call, where every negotiation silently no-ops against
`isDisposed`.

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
