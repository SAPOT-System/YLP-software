# Sapot Mobile — P2P Connection Context

The peer-to-peer connection layer: how two clients establish, maintain, and
recover a WebRTC link (data channel + media) over the `auto` / `server` / `lan`
transports.

## Language

### Recovery verbs (kept strictly distinct)

**ICE restart**:
New ICE credentials negotiated on the *same* `RTCPeerConnection` (a fresh offer
with `iceRestart: true`). Repairs a broken network path. Requires the PC to be
alive and not `closed`.
_Avoid_: renegotiation, reconnect.

**Renegotiation**:
A new offer/answer on the *same* `RTCPeerConnection` to change its tracks or
data channels — not necessarily ICE-related.
_Avoid_: reconnect, ICE restart.

**Rebuild** (a.k.a. eviction):
Discarding the `WebrtcAdapter` and its `RTCPeerConnection` entirely
(`evictWebrtcAdapter`) and constructing a brand-new one. The old ICE/DTLS/SCTP
state is gone. This is the heavyweight option.
_Avoid_: reconnect, reset.

**Reconnect**:
The UI-level act of re-dialing a peer (`chatService.connect` → `connectToPeer`).
May or may not cause a Rebuild underneath.
_Avoid_: reset, renegotiation.

### Other terms

**Liveness probe**:
Application-level `ping`/`pong` over the data channel owned by `WebrtcAdapter`.
Authoritative reachability signal because `connectionState === "connected"` can
lie after a Wi-Fi flap. Dies the moment the data channel closes.

**Thrash loop**:
The failure mode under investigation: one peer Rebuilds repeatedly while the
other holds a stale-but-"connected" PC, so each fresh offer goes unanswered.

**Unexpected offer**:
An `offer` received while the local side believes it is already connected to
that peer (`isConnected && signalingState === "stable"`). Interpreted as "the
peer Rebuilt its connection" — i.e. the existing `offer` message doubles as the
restart signal, so no dedicated reset message exists.

**Quiet callee-rebuild**:
The response to an Unexpected offer: swap in a fresh PC and answer as a callee
*without* emitting the `failed` connection-state and *without* scheduling a
reconnect. Keeps the receiver purely a callee (never a second offerer), so the
two sides cannot enter a Rebuild war. Surfaces as "Reconnecting…" in the UI,
never "Disconnected/failed".

**Active call** (in the connection layer):
The peer currently in a live media session, tracked as `{ peerId, callType }`
(not just a peer id) so that any Rebuild — including a Quiet callee-rebuild —
can re-attach the right local media tracks to the fresh PC. A Rebuild during a
chat-only session attaches no media; a Rebuild during an Active call must
re-run media initialization or the call reconnects silent/black.

---

# Sapot Mobile — Chat Messaging Context

The chat layer: how outgoing messages move from the compose input through
local persistence and out over the transport, and how their delivery state
is tracked.

## Language

**Optimistic send**:
Clearing the compose input and re-enabling the send button before the async
send pipeline (conversation init, key derivation, DB write, transport) has
completed. The message may not yet be visible in the list. Failures surface
as a `NOT_SENT` bubble with a Resend affordance — the user is never blocked
from composing the next message.
_Avoid_: fire-and-forget (too vague — it elides the error-recovery contract).

**Ghost bubble**:
A temporary React-state message injected into the message list before the
WatermelonDB write has fired, replaced by the real DB-backed record once the
write completes. Not used in this codebase — the WatermelonDB observable is
fast enough to act as the source of truth for optimistic display.
_Avoid_: optimistic bubble (ambiguous with optimistic send).

**Peer guard** (`hasPeer()`):
Synchronous check that `ChatService.peer` is set before the input is cleared.
Prevents the user from losing composed text when the peer was never resolved
(e.g. connection setup failed before `connect()` found the peer row).
_Avoid_: connection check (conflates transport state with peer resolution).

**Key warm-up**:
Proactively calling `deriveAndSetConversationKey` for a peer's existing
direct (P2P) conversation at the end of `ChatService.connect()`, so the
conversation key is cached before the user taps send. Eliminates the
per-send key derivation cost for returning conversations. Has no effect on
first-ever contact (no conversation exists yet to warm). SMS conversations
are not warmed — the GSM API latency dominates and makes key derivation
savings invisible.
_Avoid_: key pre-fetch (implies a network call; warm-up may be purely local).
