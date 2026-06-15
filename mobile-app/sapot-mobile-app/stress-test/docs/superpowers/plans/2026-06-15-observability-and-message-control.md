# PRD — Datachannel observability, media timeline, and message count control

Status: ready-for-agent

Outcome of a grilling session on the identified gaps in the WebRTC connection metrics
across all stress-test modes. Captures the agreed fixes: datachannel open tracking,
ICE state timeline, audio/video track split, per-peer message cap, WS colocation
backoff, and TCP dial-back timeout alignment.

## Problem Statement

The stress tester collects `iceEstablishMs` (time to ICE `'connected'`) and a single
`mediaEstablishMs` array, but leaves several critical gaps that make it impossible to
answer basic questions about connection quality:

1. **Datachannel open is invisible.** `dc.onOpen()` is never registered. ICE can
   report `'connected'` while the datachannel is still buffering — there is no metric
   for when messages can actually flow. `startSending` fires into the void if the DC
   is not yet open.

2. **ICE internals are opaque.** `onStateChange` only acts on `'connected'` and
   `'failed'`. Intermediate states (`new`, `checking`, `disconnected`, `completed`)
   leave no trace. An operator cannot tell whether ICE took 50ms or 14 900ms to
   check candidates, or whether peers bounced through `disconnected` before settling.

3. **Audio and video times are conflated.** Both track open events push into the same
   `mediaEstablishMs` array, making it impossible to distinguish how long audio took
   from how long video took. The video track registers no `onOpen` at all —
   `videoEstablishMs` is simply never recorded.

4. **Wrong `t=0` for media timers.** The audio `onOpen` timer starts inside
   `setupAudioTrack`, which is called after PC creation — not from `connectTo()` /
   `negotiate()`. This makes `mediaEstablishMs` incomparable with `iceEstablishMs`
   on the same timeline.

5. **No message count cap.** The only way to control how many messages a peer sends
   is `msgPerSec × durationSec`. There is no way to say "send exactly N messages and
   stop" — useful for delivery-rate verification where you want a fixed expected count.

6. **WS colocation retries use a fixed 500ms delay**, wasting time on early rounds
   and potentially not giving enough time on later rounds when the server is busy.

7. **TCP star dial-back timeout is hardcoded**, independent of
   `webrtc.connectionTimeoutMs`. A peer waiting for the phone to call back can
   stall past the operator-configured budget.

8. **`wsPeakQueueFills` is dead code.** Declared in `PeerMetrics` and `emptyMetrics`
   but never written to anywhere in the codebase.

## Solution

Extend `PeerMetrics` and the metrics pipeline with:

- `dcEstablishMs` — time from `connectTo`/`negotiate` to `dc.onOpen()`, replacing
  the current missing callback.
- `iceStateTransitions` — array of `{ state, elapsedMs }` entries, one per
  `onStateChange` firing, relative to the same `t=0` as `iceEstablishMs`.
- `audioEstablishMs` / `videoEstablishMs` — replace `mediaEstablishMs`, each
  measured from `connectTo`/`negotiate` start.

Extend `Phase` with an optional `totalMessages` field. When set, each peer
self-terminates its send interval after sending exactly that many messages.

Fix the WS colocation retry loop to use exponential backoff (capped at 5 s per
round). Align the TCP star dial-back timeout with `webrtc.connectionTimeoutMs`.
Remove `wsPeakQueueFills`.

All timing metrics share the same `t=0`: the moment `connectTo()` or `negotiate()`
is called. This makes `iceEstablishMs`, `dcEstablishMs`, `audioEstablishMs`, and
`videoEstablishMs` directly comparable on a single timeline.

## User Stories

1. As an operator, I want to see how long after ICE connects the datachannel becomes
   sendable, so that I can distinguish ICE latency from DC setup latency.
2. As an operator, I want `startSending` to only fire when the datachannel is
   confirmed open, so that early messages are not silently discarded.
3. As an operator, I want every ICE state transition recorded with its elapsed time,
   so that I can see whether peers spent time in `checking` or `disconnected` before
   reaching `connected`.
4. As an operator, I want ICE state transitions in the JSON results file, so that I
   can analyse them post-run without re-running the test.
5. As an operator, I want audio track open time measured separately from video track
   open time, so that I can see which one is the bottleneck.
6. As an operator, I want all timing metrics (`iceEstablishMs`, `dcEstablishMs`,
   `audioEstablishMs`, `videoEstablishMs`) to share the same `t=0`, so that I can
   compare them on one timeline.
7. As an operator, I want video track open time to actually be recorded (it currently
   is not), so that I have a complete picture of media setup.
8. As an operator running a verification phase, I want to set `totalMessages: N` in
   the phase config, so that each peer sends exactly N messages and I can compute
   `deliveryRate = acked / N` precisely.
9. As an operator, I want `totalMessages` to be optional, so that existing configs
   with no cap continue to work without changes.
10. As an operator, I want the WS colocation retry loop to back off exponentially, so
    that early rounds resolve quickly and later rounds give the server time to settle.
11. As an operator running a short-timeout config, I want the TCP star dial-back wait
    to respect `webrtc.connectionTimeoutMs`, so that the peer does not stall longer
    than the configured budget.
12. As a developer reading `PeerMetrics`, I want `wsPeakQueueFills` removed, so that
    the interface is not polluted with dead fields.
13. As a developer reading the JSON results file, I want ICE state transitions
    included, so that I can debug ICE failures without adding temporary logging.

## Implementation Decisions

- **`PeerMetrics` interface changes:**
  - Remove `wsPeakQueueFills` and `mediaEstablishMs`
  - Add `dcEstablishMs: number[]`
  - Add `iceStateTransitions: Array<{ state: string; elapsedMs: number }>`
  - Add `audioEstablishMs: number[]`
  - Add `videoEstablishMs: number[]`

- **`BasePeer.startSending` signature change:**
  - `startSending(msgPerSec: number, totalMessages?: number): void`
  - When `totalMessages` is set, the send interval self-terminates after
    `metrics.sent >= totalMessages`. The phase continues running (for iperf and
    network sampling); only the message interval stops early.

- **`Phase` config change:**
  - Add `totalMessages?: number` (optional; omitting preserves current
    time-bounded-only behaviour)

- **Shared `t=0` for all timing metrics:**
  - Each peer class stores `connectStartMs` set at the top of `connectTo()` (TCP)
    or `negotiate()` (WS). `setupDataChannel`, `setupAudioTrack`, and
    `setupVideoTrack` all reference this field.

- **`dc.onOpen()` registration:**
  - `setupDataChannel` registers `dc.onOpen(() => dcEstablishMs.push(...))` in all
    three peer classes.

- **`onStateChange` transition log:**
  - Every state string pushes `{ state, elapsedMs: Date.now() - startMs }` into
    `iceStateTransitions`. The existing `'connected'`/`'failed'` callbacks are
    unchanged; transitions are additive.

- **Video track setup:**
  - A `setupVideoTrack` method (mirroring `setupAudioTrack`) is added to all three
    peer classes. It registers `onOpen` and records `videoEstablishMs`.

- **WS colocation backoff:**
  - Replace `sleep(500)` with `sleep(Math.min(500 * 2^round, 5000))`.

- **TCP star dial-back timeout:**
  - Replace the hardcoded expression with `connectionTimeoutMs` directly. The outer
    connection timer already caps the total budget.

- **Metrics collector and `PhaseStats`:**
  - Remove `wsPeakQueueFills`, `recordQueueFill`, `mediaEstablishSamples`,
    `recordMediaEstablish`, `mediaEstablishP95Ms`.
  - Add `dcEstablishSamples`, `audioEstablishSamples`, `videoEstablishSamples` and
    corresponding `record*` methods.
  - Add `dcEstablishP95Ms`, `audioEstablishP95Ms`, `videoEstablishP95Ms` to
    `PhaseStats`.
  - `iceStateTransitions` are stored per-peer and included in the JSON results via
    `getMetrics()`; the collector does not aggregate them (too verbose per-peer).

- **Reporter:**
  - `formatWebrtcBlock` updated to show `dcEstablishP95Ms`, `audioEstablishP95Ms`,
    `videoEstablishP95Ms` in place of the single `mediaEstablishP95Ms`.
  - `wsPeakQueueFills` removed from all output paths.

## Testing Decisions

Good tests here verify observable behaviour through the `BasePeer` interface and
`MetricsCollector`, not internal implementation details:

- Instantiate a peer with a mock `node-datachannel` that fires `onOpen` callbacks
  synchronously, then call `getMetrics()` and assert the timing arrays.
- For `totalMessages`: call `startSending(rate, N)`, advance fake timers N+1 ticks,
  assert `metrics.sent === N` (not N+1).
- For `iceStateTransitions`: fire `onStateChange` with several state strings, assert
  that `getMetrics().iceStateTransitions` contains entries in order with monotonically
  increasing `elapsedMs`.
- Prior art: `tests/metrics/reporter.test.ts` (collector/reporter unit tests).

The colocation backoff change can be covered by spying on `sleep` and asserting the
call argument sequence across retry rounds.

## Out of Scope

- Tracking candidate-pair details (STUN/TURN server used, RTT per candidate) —
  requires stats API not available in current `node-datachannel` version.
- Reconnection logic after ICE `failed`.
- DTLS, SCTP, or RTCP timing metrics.
- Backpressure tracking (`bufferedAmount`) — not usefully exposed by
  `node-datachannel`.

## Further Notes

All three peer classes (`TcpSignaledWrtcPeer`, `WsSignaledWrtcPeer`, `WsStarPeer`)
share the same `createPc` / `setupDataChannel` / `setupAudioTrack` pattern and
receive identical changes. The interface changes in `base-peer.ts` and
`test-config.ts` should land first so the compiler catches any missed call sites.
