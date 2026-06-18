# Sapot Stress Test

Simulates many fake peers on your laptop using Sapot's exact encrypted protocols to measure WebRTC signaling load. Two modes are supported: **tcp-signaled** (LAN path) and **ws-signaled** (server relay path).

---

## Quick Start

```bash
cd stress-test
npm install

# Install iperf3 (required for link-load measurement in both modes)
sudo apt install iperf3      # Debian/Ubuntu
brew install iperf3          # macOS
iperf3 --version             # confirm
```

---

## Verify Your Setup (Run Before Full Tests)

Uses `verify-stress-test.config.json` — 2 peers, 2 msg/s, 20 s. No edits needed for laptop-only runs.

### 1. Edit verify-stress-test.config.json

```bash
# Find your laptop's WiFi IP
ip addr show | grep "inet " | grep -v 127.0.0.1
```

```json
{
  "lan": {
    "hostIp": "<YOUR_LAPTOP_IP>",
    "iperfTargetIp": "<IPERF_HOST_IP>"
  },
  "ws": {
    "serverUrl": "https://<YOUR_SERVER_IP>"
  },
  "phases": [{ "peerCount": 2, "msgPerSec": 2, "durationSec": 20 }]
}
```

> For `tcp-signaled`, `iperfTargetIp` is the machine running `iperf3 -s` (can be the laptop itself).
> For `ws-signaled`, the iperf target is auto-derived from `ws.serverUrl` — no extra field needed.

### 1a. Start the iperf3 server

On the machine named by `lan.iperfTargetIp` (for tcp-signaled) or on the server host (for ws-signaled):

```bash
# Run in a separate terminal and leave it running for the duration of the test
iperf3 -s
```

Confirm the path works from the laptop:

```bash
iperf3 -c <IPERF_HOST_IP> -u -t 3
# Expected: throughput summary with 0% or low loss
```

### 2. Verify tcp-signaled

```bash
npx ts-node src/runner.ts --mode tcp-signaled --config verify-stress-test.config.json
```

Pass: `WebRTC Connections` shows `2/2` connected.

### 3. Verify ws-signaled

```bash
# Seed accounts first if not done yet
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node scripts/seed-test-accounts.ts \
  --server-url https://<SERVER_IP> --count 10

# Run verification
NODE_EXTRA_CA_CERTS=/path/to/server.crt \
  npx ts-node src/runner.ts --mode ws-signaled --config verify-stress-test.config.json
```

Pass: `WebRTC Connections` shows `2/2` connected.

---

## tcp-signaled — LAN Signaling Path

Peers exchange SDP/ICE over real TCP sockets using NaCl encryption — the exact wire protocol the Sapot app uses on LAN. Runs entirely on the laptop; no phone required unless using star mode.

### Smoke test (pair mode — 2 peers, laptop only)

```bash
npx ts-node src/runner.ts --mode tcp-signaled --config verify-stress-test.config.json
```

Expected: `WebRTC Connections` block shows `2/2` peers connected.

### Star mode (all peers → phone)

```bash
# 1. Confirm phone is visible
adb devices

# 2. Launch the Sapot app — log in, navigate to the People screen

# 3. Find your laptop's WiFi IP
ip addr show | grep "inet " | grep -v 127.0.0.1

# 4. Edit verify-stress-test.config.json — set lan.hostIp to your laptop IP
#    "hostIp": "192.168.1.23"

# 5. Run (phone fields — phoneIp, phonePort, phoneUserId — are auto-discovered via adb logcat)
npx ts-node src/runner.ts --mode tcp-signaled --config verify-stress-test.config.json
```

### Full stress run

```bash
npx ts-node src/runner.ts --mode tcp-signaled --config stress-test.config.json
```

### iperf setup (tcp-signaled)

iperf target = `lan.iperfTargetIp` if set, otherwise falls back to `lan.hostIp`.

```bash
# On the iperf target machine — leave running in a separate terminal
iperf3 -s

# Confirm reachable from laptop
iperf3 -c <IPERF_TARGET_IP> -u -t 3
```

### Config requirements

```json
{
  "lan": {
    "hostIp": "192.168.1.23",
    "iperfTargetIp": "192.168.1.5"
  },
  "webrtc": { "connectionTimeoutMs": 10000, "iceServers": [] },
  "phases": [{ "peerCount": 10, "msgPerSec": 1, "durationSec": 60, "runIperf": true }]
}
```

> `peerCount` must be **even** (peers connect in pairs). `runIperf: true` enables iperf for that phase — the offered rate is auto-calibrated from a TCP probe, not a per-phase value.

---

## ws-signaled — Server Relay Signaling Path

Peers authenticate with the FastAPI server, open a WebSocket, and exchange SDP/ICE through the server relay — the same path the Sapot app uses when peers are not on the same LAN. No phone required.

### Prerequisites

```bash
# 1. Seed test accounts (run once)
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node scripts/seed-test-accounts.ts \
  --server-url https://<SERVER_IP> \
  --count 100

# 2. Confirm server is reachable
curl -k https://<SERVER_IP>/health
```

### Smoke test

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt \
  npx ts-node src/runner.ts --mode ws-signaled --config verify-stress-test.config.json
```

Expected: `WebRTC Connections` block shows `2/2` peers connected. If you see `Login failed for stress_0`, seed accounts first.

### Full stress run

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt \
  npx ts-node src/runner.ts --mode ws-signaled --config stress-test.config.json
```

### iperf setup (ws-signaled)

iperf target is auto-derived from the hostname in `ws.serverUrl` — no extra config field needed. Start the server on that host:

```bash
# On the server host — leave running in a separate terminal
iperf3 -s

# Confirm reachable from laptop
iperf3 -c <SERVER_IP> -u -t 3
```

### Config requirements

```json
{
  "ws": {
    "serverUrl": "https://192.168.1.100",
    "accountPrefix": "stress_peer_",
    "password": "your-password"
  },
  "webrtc": { "connectionTimeoutMs": 20000 },
  "phases": [{ "peerCount": 10, "msgPerSec": 1, "durationSec": 60, "runIperf": true }]
}
```

> `peerCount` must be **even**. `NODE_EXTRA_CA_CERTS` is required for self-signed server certs. `runIperf: true` enables iperf for that phase — the offered rate is auto-calibrated from a TCP probe, not a per-phase value.

---

## Reading Results

```
Phase                  | Peers | Msg/s | Delivered | TxOvf   | P50  | P95   | RTT σ
-----------------------|-------|-------|-----------|---------|------|-------|------
tcp-peers10-msg1       |    10 |     1 |    100.0% |       0 | 11ms | 19ms  | 3ms
```

| Column | Meaning | Healthy |
|---|---|---|
| Delivered | acked / sent over the data channel | 99%+ |
| TxOvf | local send-queue overflow (backpressure, **not** network loss) | 0 |
| P50 | median data-channel RTT | < 50 ms |
| P95 | 95th-percentile data-channel RTT | < 200 ms |
| RTT σ | stddev of RTT samples (**not** RFC-3550 jitter) | low/stable |

Results JSON is saved to `./stress-results/`.

---

## Phone Build Requirements (Star Mode)

Star mode requires the phone to run a **development or preview** build of Sapot — **not a production build**. Three things are gated to internal builds:

- **Phone discovery**: the app logs its WiFi IP, TCP port, and `userId` to logcat — used by the orchestrator to locate the phone automatically (ADR-0002). Production builds never log the userId.
- **Session attribution**: the app logs session accepted/rejected/active-count events that the orchestrator uses to classify ICE failures as phone-refused vs never-arrived (ADR-0005). Production builds never emit these lines.

### Session-log contract (what the phone app must emit)

The app emits these lines in development/preview builds at the point a session is accepted or rejected:

```
session › accepted {"sessionId":"<uuid>","peerId":"<uuid>","activeSessions":<n>}
session › rejected {"sessionId":"<uuid>","peerId":"<uuid>","reason":"<str>","activeSessions":<n>}
session › active-count {"count":<n>}
```

The multi-line react-native-logs device format is also accepted:

```
 LOG  session | INFO : session › accepted
{
  "sessionId": "...",
  "peerId": "...",
  "activeSessions": 2
}
```

If these lines are absent (production build or lines silenced), the report shows `attribution: unavailable (no phone session log)` instead of per-kind failure counts. The test still runs and reports the ceiling; attribution is degraded gracefully.

See `docs/adr/0005-phone-side-session-log-contract.md` for the full format spec.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `tcp-signaled`: 0/N connected | Check `iceServers: []` in config; verify no firewall blocks loopback UDP |
| `ws-signaled`: `Login failed for stress_0` | Run the seed script with `--count` ≥ `peerCount` |
| `ws-signaled`: ICE never completes | Increase `webrtc.connectionTimeoutMs` to `20000`; check server latency |
| Phone not found (star mode) | Run `adb devices`; reconnect USB; re-enable USB Debugging |
| `adb` not found | Install Android Platform Tools |
| iperf columns show `-` | `iperf3` not installed, or no `iperf3 -s` running at the target IP |
| iperf connects but near-0 throughput | Firewall blocking UDP 5201 at the target — allow it inbound |
| Attribution shows "unavailable" | Phone is running a production build; switch to development/preview |
