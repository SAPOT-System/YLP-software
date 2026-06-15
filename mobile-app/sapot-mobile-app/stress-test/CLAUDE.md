# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A standalone Node.js/TypeScript load tester for the Sapot mobile app's networking. It spins up many fake "peers" on a laptop that speak Sapot's exact encrypted wire protocols, then measures how the app (or the WebRTC engine itself) behaves under signaling load. Two modes: `tcp-signaled` (NaCl-encrypted TCP signaling, mirrors the LAN path) and `ws-signaled` (WebSocket relay signaling, mirrors the server path). Each mode supports a **pair** sub-mode (peers negotiate with each other) and a **star** sub-mode (all peers target a real phone).

`README.md` is the operator-facing manual (setup, phone state, firewall, iperf, troubleshooting, output reading) — **read it before changing user-facing behavior or CLI flags so docs stay in sync.** This file covers code architecture and the dev loop.

## Commands

Run everything from inside this `stress-test/` directory.

```bash
npm install              # installs deps incl. node-datachannel (native)
npm test                 # jest — all unit tests under tests/
npx jest tests/metrics/reporter.test.ts   # single test file
npx jest -t "delivery"   # tests matching a name pattern
npm run build            # tsc → dist/ (compile check; the runner is normally executed via ts-node)
npm run run:stress       # ts-node src/runner.ts with defaults (reads ./stress-test.config.json)

# Run a specific mode (mode/flags override the config file):
npx ts-node src/runner.ts --mode tcp-signaled --config verify-stress-test.config.json   # laptop-only pair mode
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws-signaled --server-url https://<SERVER_IP>
```

There is no lint step and no separate typecheck script — use `npm run build` to catch type errors. `tsconfig.json` excludes `tests/`; tests compile under `tsconfig.test.json` (adds the `@/*` → `src/*` path alias used by jest's `moduleNameMapper`).

`NODE_EXTRA_CA_CERTS` is **required** for `ws-signaled` mode — it points Node at the server's CA so HTTPS/WSS auth succeeds. The runner ends with `process.exit(0)` because native handles keep the event loop alive otherwise.

## Architecture

Flow: `runner.ts` (CLI via commander) → loads + `validateConfig` → constructs `Orchestrator(config, MetricsCollector, NetworkSampler)` → `orchestrator.run()` → prints table + writes JSON to `outputDir`.

### Layers

- **`src/runner.ts`** — CLI entry. Parses flags, applies overrides onto the config object, validates, runs, reports, force-exits.
- **`src/orchestrator/`**
  - `test-config.ts` — config types (`TestConfig`, `Phase`, per-transport sub-configs) and `validateConfig`. Note: webrtc rejects **odd** `peerCount` (peers connect in pairs).
  - `orchestrator.ts` — the engine. Iterates transports (`both` → `["lan","ws"]`) then phases. Per phase: spawn peers → connect → wire targets → `startSending` → sleep `durationSec` → `stopSending` → `disconnect` → compute stats. Also owns the **iperf** subsystem (shells out to `iperf3`): a one-time TCP capacity probe auto-calibrates the UDP offered load to `UDP_LOAD_FACTOR` (90%) of measured capacity, a Stage-1 clean baseline, and a Stage-2 under-load run concurrent with each phase.
- **`src/peers/`** — one class per transport, all implementing `BasePeer` (`connect`/`startSending`/`stopSending`/`disconnect`/`getMetrics`).
  - `base-peer.ts` — the `BasePeer` interface, the `PeerMetrics` shape, and `emptyMetrics()`.
  - `tcp-signaled-wrtc-peer.ts` — real `RTCPeerConnection` via `node-datachannel`, signaled over NaCl-encrypted TCP. Pair mode: starts a TCP server and connects to partner over loopback. Star mode: dials the phone's TCP server directly.
  - `ws-signaled-wrtc-peer.ts` — real `RTCPeerConnection` via `node-datachannel`, signaled over the server's `/ws/` WebSocket relay. Pair mode only.
  - `ws-star-peer.ts` — like `ws-signaled-wrtc-peer.ts` but targets the phone's `userId` instead of a laptop partner.
- **`src/protocol/`** — wire formats shared by peers.
  - `tcp-protocol.ts` — NaCl box handshake + `EncryptedEnvelope` encrypt/decrypt (mirrors the app's LAN encryption).
  - `ws-protocol.ts` — JWT fetch/decode, WS URL building, chat message + server-ack/pong shapes.
- **`src/metrics/`**
  - `collector.ts` — accumulates per-peer sent/acked/dropped/latency + ICE/RTP/media samples; `computeStats()` produces a `PhaseStats` (percentiles, jitter as stddev). Reset per phase.
  - `network-sampler.ts` — samples device network stats (via ADB) during a phase.
  - `reporter.ts` — `formatTable`, `computeNetworkStats`, `formatSaturationAnalysis`, `formatWebrtcBlock`, `formatIperfComparison`, `writeResults`.

### tcp-signaled mode

`tcp-signaled` runs real `RTCPeerConnection`s between peers, using **raw TCP sockets with NaCl encryption** as the signaling channel — the exact wire protocol the Sapot app uses on LAN. Data flows peer-to-peer over an `RTCDataChannel` once ICE completes.

Requires both `lan` and `webrtc` sub-configs. Two sub-modes:
- **Pair mode** (no `lan.phoneIp`): peers negotiate with each other over loopback. `peerCount` must be even. Even-indexed peers are offerers.
- **Star mode** (`lan.phoneIp` + `lan.phonePort` + `lan.phoneUserId` set): all laptop peers dial the phone.

**Pair mode flow:**
1. Each peer starts a TCP server (`server.listen`). Offerers then `connectTo("127.0.0.1", answerer.port)`.
2. **NaCl ECDH handshake** — initiator sends `{ type: 'handshake-init', pub }`, listener replies `{ type: 'handshake-ack', pub }`. Both derive a shared key via `nacl.box.before`.
3. All subsequent frames are `{ type: 'encrypted', nonce, box }` (NaCl secretbox). Inside: `{ type: 'signal', signal: offer|answer|candidate }`.
4. **Data channel traffic** — `startSending` fires `MSG:{seq}:{sentAt}`; receiver echoes `ACK:{seq}:{sentAt}`; sender records round-trip latency.

**Star mode differences:** After the handshake, signals are sent in the **app-native format** (`{ type: 'offer'|'ice-candidate', data: { to, sender, sdp, ipAddress, port } }`) so the phone's `SignalingService` routes them. The peer's own TCP server stays open so the phone can dial back with its answer.

**Key files:** `src/peers/tcp-signaled-wrtc-peer.ts`, `src/protocol/tcp-protocol.ts` (ECDH + encrypt/decrypt + `SignalMessage` types), `orchestrator.ts:226–306` (tcp-signaled branch).

### ws-signaled mode

`ws-signaled` runs real `RTCPeerConnection`s between laptop peers, using the server's `/ws/` WebSocket as the signaling relay — the same path the Sapot app uses. Data flows peer-to-peer over an `RTCDataChannel` once ICE completes; the WebSocket is only used for SDP/ICE exchange.

**Two sub-modes** (selected by whether `ws.phoneUserId` is set):
- **Pair mode** (no `phoneUserId`): peers negotiate with each other. `peerCount` must be even. Even-indexed peers are offerers. Uses `WsSignaledWrtcPeer`.
- **Star mode** (`phoneUserId` set): all laptop peers target the phone. Uses `WsStarPeer`.

**Pair mode flow:**
1. `connect()` — POST `/auth/token` with `{accountPrefix}{index}` credentials → decode `userId` from JWT → open WebSocket to `/ws/?token=<jwt>` → start 15s heartbeat pings.
2. **Colocation loop** — gunicorn multi-worker deployments keep separate `active_connections` per process; cross-worker peers cannot relay signals to each other. The orchestrator polls `get-active-users` on each offerer (up to 20 rounds) and reconnects answerers until both peers land on the same worker.
3. `negotiate(partnerUserId)` — offerer creates `RTCPeerConnection` (via `node-datachannel`), creates `chat` data channel, optionally adds audio/video tracks. `onLocalDescription` wraps the SDP into `{ type: 'offer'|'answer', data: { sender, to, sdp } }` matching the FastAPI `SignalMessage`/`SDPData` models and sends it over the WebSocket. Server relays it to the partner. ICE candidates flow as `{ type: 'ice-candidate', data: { sender, to, candidate } }`.
4. **Data channel traffic** — `startSending` fires `MSG:{seq}:{sentAt}` at the configured rate; receiver echoes `ACK:{seq}:{sentAt}`; sender records round-trip latency.

**Key files:** `src/peers/ws-signaled-wrtc-peer.ts`, `src/peers/ws-star-peer.ts`, `src/protocol/ws-protocol.ts` (signal message builders/parsers), `orchestrator.ts:308–445` (ws-signaled branch).

### How messaging, audio call, and video call are tested

**Messaging** — `MSG:`/`ACK:` ping-pong over the relevant transport:
- `WsSignaledWrtcPeer` / `WsStarPeer` / `TcpSignaledWrtcPeer`: sends `MSG:{seq}:{sentAt}` over an `RTCDataChannel` (`chat`); receiver echoes `ACK:{seq}:{sentAt}`; sender measures round-trip latency from `sentAt`.
- Metrics → `sent`, `acked`, `dropped`, `writeLatencySamples` → `p50Ms`, `p95Ms`, `p99Ms`, `jitterMs`, `deliveryRate`.

**Audio call** — synthetic Opus RTP stream at 50 pkt/s (every 20ms). Built by `rtp-utils.ts:buildRtpPacket`: 12-byte RTP header (PT=111, 48 kHz clock, timestamp +960/frame) + 32-byte zero payload (44-byte packet total). Added to the `RTCPeerConnection` as `new Audio('audio', 'SendOnly')` with `addOpusCodec(111)`. `track.onOpen` records `mediaEstablishMs`. Triggered when `webrtc.media.type` is `"audio"` or `"audio-video"`.

**Video call** — synthetic H.264 RTP stream at ~30 fps (every 33ms). Built by `rtp-utils.ts:buildVideoRtpPacket`: 12-byte RTP header (PT=96, 90 kHz clock, timestamp +3000/frame) + `(bitrate_kbps × 1000 / 8 / 30)` bytes of zero payload. Added as `new Video('video', 'SendOnly')` with `addH264Codec(96)`. Triggered only by `webrtc.media.type = "audio-video"`.

Both `addTrack` calls are wrapped in try/catch — if `node-datachannel` was built without media support the run degrades to data-channel-only without throwing. Metrics → `rtpPacketsSent`, `rtpPacketsLost`, `mediaEstablishP95Ms` (reported in the WebRTC block).

**Which modes test what:**

| Mode | Messaging | Audio | Video |
|---|---|---|---|
| `tcp-signaled` | RTCDataChannel | ✓ if `media.type` set | ✓ if `audio-video` |
| `ws-signaled` | RTCDataChannel | ✓ if `media.type` set | ✓ if `audio-video` |

### Conventions that matter here

- **Adding a transport mode:** extend the `mode` union + sub-config in `test-config.ts`, add a `validateConfig` branch, add a `*-peer.ts` implementing `BasePeer`, and wire spawning + target setup in `orchestrator.ts`. Keep peers transport-pure — all aggregation goes through `MetricsCollector`.
- **iperf numbers:** `phase.runIperf` is a boolean flag that enables iperf for that phase. The iperf client offered rate is auto-calibrated from the TCP probe — there is no per-phase rate config. iperf runs for `lan`/`ws` whenever a phase sets `runIperf: true`; for `webrtc` only when `webrtc.iperfTargetIp` is also set.
- **node-datachannel is optional at runtime:** media `addTrack` is wrapped in try/catch so a build without media support degrades to data-channel-only instead of throwing. Only `webrtc` mode loads it.
- Config files in this dir: `stress-test.config.json` (default, tcp-signaled audio-video), `verify-stress-test.config.json` (2-peer smoke), `stress-test.tcp-star.config.json` (star mode). Results land in `./stress-results/`.

## Testing

`tests/` mirrors `src/`. Tests run under jest + ts-jest, `testEnvironment: node`, 15 s timeout. Import source via the `@/` alias (e.g. `import { MetricsCollector } from '@/metrics/collector'`). After changing peer/orchestrator/metrics logic, run the matching test file and `npm run build` to confirm types.
