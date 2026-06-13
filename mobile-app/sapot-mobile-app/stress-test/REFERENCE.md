# Stress Test Reference

## Modes

| Mode | Signaling | Data path | Phone required |
|------|-----------|-----------|----------------|
| `tcp-signaled` | TCP + NaCl encryption (LAN) | RTCDataChannel | Optional (star) |
| `ws-signaled` | WebSocket relay (`/ws/`) | RTCDataChannel | Optional (star) |

**Pair mode** — peers negotiate with each other; `peerCount` must be even.  
**Star mode** — all laptop peers target the phone (`lan.phoneIp` or `ws.phoneUserId` set).

## Quick commands

```bash
# Smoke test (2 peers, pair mode)
npx ts-node src/runner.ts --mode tcp-signaled --config verify-stress-test.config.json

# Full run (reads stress-test.config.json)
npm run run:stress

# WS-signaled with custom server cert
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws-signaled

# Build check
npm run build

# Tests
npm test
npx jest tests/metrics/reporter.test.ts
```

## Config files

| File | Purpose |
|------|---------|
| `stress-test.config.json` | Default run (tcp-signaled, audio-video) |
| `verify-stress-test.config.json` | 2-peer smoke test |
| `stress-test.tcp-star.config.json` | Star mode (phone target) |

## Key config fields

```jsonc
{
  "mode": "tcp-signaled" | "ws-signaled",
  "lan": {
    "hostIp": "<laptop IP>",
    "phoneIp": "<phone IP>",      // star mode only
    "phonePort": 9000,            // star mode only
    "phoneUserId": "<uuid>",      // star mode only
    "adbDiscovery": true,         // auto-discover via adb
    "iperfTargetIp": "<ip>"
  },
  "ws": {
    "serverUrl": "https://<server>",
    "accountPrefix": "stress_",
    "phoneUserId": "<uuid>",      // star mode only
    "iperfTargetIp": "<ip>"
  },
  "webrtc": {
    "connectionTimeoutMs": 10000,
    "media": { "type": "audio" | "audio-video", "bitrate": 32 },
    "iperfTargetIp": "<ip>"
  },
  "phases": [
    { "peerCount": 2, "msgPerSec": 5, "durationSec": 30, "runIperf": false }
  ],
  "outputDir": "./stress-results"
}
```

## Source layout

```
src/
  runner.ts                     CLI entry (commander)
  orchestrator/
    orchestrator.ts             Phase loop, iperf, peer wiring
    test-config.ts              Config types + validateConfig
  peers/
    base-peer.ts                BasePeer interface + PeerMetrics
    tcp-signaled-wrtc-peer.ts   tcp-signaled mode
    ws-signaled-wrtc-peer.ts    ws-signaled pair mode
    ws-star-peer.ts             ws-signaled star mode
  protocol/
    tcp-protocol.ts             NaCl ECDH handshake + EncryptedEnvelope
    ws-protocol.ts              JWT auth, signal message builders
  metrics/
    collector.ts                Per-peer stats accumulator
    network-sampler.ts          ADB network sampling
    reporter.ts                 Table formatting + JSON output
  discovery/
    adb-runner.ts               ADB phone discovery
```

## Output metrics

Results land in `./stress-results/` as JSON + a printed table.

`deliveryRate` · `p50Ms` · `p95Ms` · `p99Ms` · `jitterMs` · `rtpPacketsSent` · `rtpPacketsLost` · `mediaEstablishP95Ms`
