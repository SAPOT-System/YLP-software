# Sapot Stress Test

A tool that finds the limits of the Sapot app's networking by simulating many fake users ("peers") connecting to it from your laptop.

---

## Background: How Sapot Connects Devices

Sapot supports two ways for devices to talk to each other:

- **LAN mode (direct)** — Devices on the same WiFi network connect directly to each other over TCP (like a local file share). The phone and the laptop discover each other automatically using mDNS (the same technology that lets you find printers on a local network). No internet required.

- **Server mode (relay)** — Messages are sent to a FastAPI server and the server forwards them to the recipient. This works over the internet but adds one extra hop.

**Stress Test Focus: WebRTC Signaling**
In actual mobile app usage, TCP and WebSocket are primarily used for **WebRTC connection formation (signaling)**. This stress test simulates up to 100 fake users ("simulated peers") running on your laptop to measure how the app handles signaling load from many concurrent peers. These fake users speak exactly the same encrypted protocol as the real Sapot app so the phone cannot tell the difference.

**What we are measuring:** how many fake users and how much signaling traffic the app can handle before it starts dropping connections or slowing down.

---

## Which Test Should I Run? (Start Here)

This tool runs four kinds of tests. Pick one based on what you want to measure — you do **not** need to understand the internals to choose.

| You want to test... | Use mode | Need the phone? | Setup required |
|---|---|---|---|
| The app on a real phone over the **same WiFi** (no internet) | `lan` | ✅ Yes — Android + USB | Phone state + firewall ports |
| The app on a real phone **through the internet server** | `ws` | ✅ Yes — Android + USB | Phone state + running server + seeded accounts |
| Both phone tests, back-to-back | `both` | ✅ Yes | Everything above |
| Only the **peer-to-peer voice/video engine**, on the laptop | `webrtc` | ❌ No phone at all | Just Node.js on the laptop |
| WebRTC over the **real NaCl-encrypted LAN TCP signaling channel** | `tcp-signaled` | ❌ No phone at all | Just Node.js on the laptop |
| WebRTC over the **WebSocket server relay** (realistic multi-machine path) | `ws-signaled` | ❌ No phone at all | Running server + seeded accounts |

**First time? Run the `webrtc` test first.** It needs nothing but your laptop and proves the tool itself works before you wrestle with phone, WiFi, and firewall setup. Then move on to the phone tests.

> The mode comes from the `"mode"` field in `stress-test.config.json` (or `--mode` on the command line). **The shipped default is `webrtc` — laptop-only, the phone is never used.** Change it to `lan`, `ws`, or `both` when you are ready to test a real phone.

**Everything below about phone state, ADB, and firewall ports applies only to the phone tests (`lan` / `ws` / `both`). The `webrtc`, `tcp-signaled`, and `ws-signaled` tests skip all of it.**

---

## The Mobile App's Role

> Applies to the **phone tests** (`lan` / `ws` / `both`) only. Skip this section if you are running the laptop-only `webrtc` test.

The Sapot app on the phone is the **system under test — a passive target**. You do not interact with the phone during the test.

- **LAN mode** — Each simulated peer on the laptop opens a TCP server and advertises itself via mDNS (`_lanchat._tcp`). The Sapot app discovers those fake peers (exactly as it would discover a real device) and connects to them. You don't do anything on the phone; the app does this automatically when it sees the mDNS announcements.
- **WS mode** — Fake peers log in as `stress_peer_0`, `stress_peer_1`, … and send messages through the FastAPI relay to the account that is logged in on the phone.

**Required phone state before you start:**

| State | Why it matters |
|---|---|
| Logged in with a real account (not guest) | WS relay needs a real target user ID |
| App in the **foreground** | Android throttles TCP/WebSocket for background apps — a backgrounded app will silently drop connections mid-test |
| **Screen timeout disabled** (or screen kept on) | Screen lock triggers the same Android network throttling as backgrounding |
| Navigate to the **People / peer list screen** | This is where the app actively listens for incoming LAN connections |

---

## Prerequisites

Before running the stress test, you need:

| Requirement | Why | How to check |
|---|---|---|
| Physical Android device + USB cable | The stress test targets a real app running on a real device | `adb devices` — should list your device |
| ADB (Android Debug Bridge) installed | Used to read network stats from the device | `adb version` |
| Sapot app running on the phone (see state requirements above) | The thing being tested | Open the app; log in; stay on the peer list screen |
| Phone and laptop on the **same WiFi** | LAN mode only works on a local network | Both connected to the same router (not guest vs. main network) |
| Node.js 18+ installed on laptop | Runs the simulator | `node --version` |
| FastAPI server running (WS mode only) | Needed for server relay tests | `curl https://<SERVER_IP>/health` |
| **Firewall allows TCP 9000–9100 inbound** (LAN mode) | The phone connects inbound to the simulated peers on those ports | `sudo ufw status` — add rules if needed: `sudo ufw allow 9000:9100/tcp` |
| `iperf3` installed on the laptop | The runner shells out to the `iperf3` client to measure raw link throughput/loss/jitter during each phase | `iperf3 --version` |
| `iperf3 -s` running on the target machine | iperf needs a listening server at the target IP to connect to | Start `iperf3 -s` on the target host (e.g. the server box or a second LAN machine) |

---

## Setup

**1. Install dependencies** (once, from inside the `stress-test/` folder):

```bash
cd stress-test
npm install
```

Also install `iperf3` — it is required for every LAN/WS run (link-load measurement):

```bash
sudo apt install iperf3      # Debian/Ubuntu
brew install iperf3          # macOS
iperf3 --version             # confirm it's on PATH
```

**2. Edit the config** to match your network.

> **Before anything else, check the `"mode"` field.** The shipped config is `"mode": "webrtc"` (laptop-only — the phone is never touched). For a phone test, change it to `"lan"`, `"ws"`, or `"both"`. See [Which Test Should I Run?](#which-test-should-i-run-start-here).

For phone tests (`lan` / `ws` / `both`), open `stress-test/stress-test.config.json` and update these fields (the `webrtc` test ignores them):

```json
{
  "lan": {
    "hostIp": "192.168.1.100",        ← change to YOUR laptop's IP on the WiFi
    "iperfTargetIp": "192.168.1.2"    ← host running `iperf3 -s` (defaults to hostIp if omitted)
  },
  "ws": {
    "serverUrl": "https://192.168.1.100"   ← change to the server's IP (https, no port; also the iperf target)
  }
}
```

To find your laptop's IP: run `ip addr show | grep "inet " | grep -v 127.0.0.1` (Linux/Mac).

**3. Start the iperf3 server** at the target IP (required for LAN/WS runs):

On the machine named by `lan.iperfTargetIp` (LAN) or the WS server host, run the iperf3 server and leave it running in its own terminal for the duration of the test:

```bash
iperf3 -s     # listens on UDP/TCP 5201 by default
```

If the target is the same laptop running the test (i.e. `iperfTargetIp` is omitted and falls back to `hostIp`), run `iperf3 -s` in a second terminal on the laptop.

**4. Seed test accounts** (WS mode only — run once before the first WS test):

The server relay tests log in as real users. This script creates the test accounts:

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node scripts/seed-test-accounts.ts \
  --server-url https://<SERVER_IP> \
  --count 100
```

You only need to run this once — accounts persist in the database.

---

## Verify Your Setup (Run Before the Full Test)

Before committing to a full multi-phase run, confirm every layer is wired up correctly. A misconfigured IP produces 100% silence with no useful error message.

### Step 1 — Check all tools are present

```bash
adb version            # Android Debug Bridge
adb devices            # should list your device (not "unauthorized")
node --version         # must be 18+
npx ts-node --version  # must print a version, not an error
iperf3 --version       # required for LAN/WS runs (link-load measurement)
```

Make sure the `iperf3 -s` server is already running at the target IP (Setup step 3).

### Step 2 — Confirm your laptop's IP

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

Note the IP on your WiFi interface (usually `192.168.x.x`). Make sure it matches `lan.hostIp` in `stress-test.config.json`.

### Step 3 — Confirm the phone is on the same network

```bash
adb shell ip addr show wlan0 | grep "inet "
```

The first two octets (e.g. `192.168`) must match your laptop's IP.

### Step 4 — (WS mode only) Confirm the server is reachable

```bash
curl https://<SERVER_IP>/health
# expected: {"status": "ok"} or similar 200 response
```

### Step 5 — Confirm the iperf3 server is reachable (LAN/WS)

With `iperf3 -s` running on the target host (Setup step 3), run a quick 3-second client probe from the laptop:

```bash
iperf3 -c <iperfTargetIp> -u -t 3
# expected: a throughput summary with 0% (or low) loss — confirms the iperf path works
```

If this hangs or prints `unable to connect`, the iperf server isn't running or a firewall is blocking UDP/TCP 5201 at the target.

### Step 6 — Run a 2-peer smoke test (confirm your mode works)

This is the fastest way to confirm everything works end-to-end before committing to a full run. Each smoke test runs **2 fake peers** for 20 seconds and should show ~100% delivery (or `2/2` connected for WebRTC). **Run only the one for the mode you plan to use** — but a green smoke test for every mode confirms the whole tool is healthy.

All four commands below pass `--config verify-stress-test.config.json` — a dedicated, pre-built config for this step. **You don't edit your main `stress-test.config.json` at all.** The shipped file already contains a single 2-peer phase (2 is the minimum, and WebRTC requires an **even** number since it connects peers in pairs) plus `iperfLoadMbps`, so the LAN/WS smoke tests also confirm the iperf path. `--mode` on the command line overrides the file's `mode`, so the same file works for all four runs:

```json
"phases": [{ "peerCount": 2, "msgPerSec": 1, "durationSec": 20, "iperfLoadMbps": 50 }]
```

Before a LAN/WS smoke test, set `lan.iperfTargetIp` (LAN) / `ws.serverUrl` (WS) in `verify-stress-test.config.json` to match your network, and confirm its `lan.hostIp` is your laptop IP.

**1. WebRTC — no phone (do this one first):**
```bash
npx ts-node src/runner.ts --mode webrtc --config verify-stress-test.config.json
```
Success = a **WebRTC Connections** block reporting `2/2` peers connected. If you see that, the tool itself works.

**2. LAN — requires the phone:**
```bash
npx ts-node src/runner.ts --mode lan --host-ip <YOUR_LAPTOP_IP> --config verify-stress-test.config.json
```
Success = row `lan-peers2-msg1` at `100.0%` delivered.

**3. WS / server — requires the phone, a running server, and seeded accounts:**
```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws --server-url https://192.168.1.23 --config verify-stress-test.config.json
```
Success = row `ws-peers2-msg1` at `100.0%` delivered. If you see `Login failed for stress_peer_0`, seed the test accounts first (Setup step 4).

**4. Both — runs LAN then WS back-to-back:**
```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode both \
  --host-ip <YOUR_LAPTOP_IP> \
  --server-url https://<SERVER_IP> \
  --config verify-stress-test.config.json
```
Success = both `lan-peers2-msg1` and `ws-peers2-msg1` rows at `100.0%`. Confirms both phone paths in one pass.

**5. TCP-signaled — laptop-only, real NaCl signaling path:**
```bash
npx ts-node src/runner.ts --mode tcp-signaled --config stress-test.tcp-signaled.config.json
```
Success = a **WebRTC Connections** block reporting `2/2` peers connected (or more depending on `peerCount`). Confirms the ECDH handshake and encrypted signaling path works.

**6. WS-signaled — laptop-only, server relay signaling path:**
```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws-signaled --config stress-test.ws-signaled.config.json
```
Success = a **WebRTC Connections** block reporting `2/2` peers connected. If you see `Login failed for stress_0`, seed the test accounts first (Setup step 4).

**Expected output for a phone mode (`lan` / `ws` / `both`) — setup is working:**
```
Phase                  | Peers | Msg/s | Delivered | Dropped | P50  | P95
-----------------------|-------|-------|-----------|---------|------|-----
lan-peers2-msg1        |     2 |     1 |    100.0% |       0 | <50ms| <100ms
```

**If Delivered shows 0% (phone modes):** the phone is not connecting. Check:
1. `lan.hostIp` (LAN) or `ws.serverUrl` (WS) in config is correct
2. Firewall allows TCP 9000+ inbound — LAN only (`sudo ufw allow 9000:9100/tcp`)
3. App is in the foreground on the peer list screen
4. Phone and laptop are on the same WiFi (not guest vs. main)

**If the WebRTC block shows less than `2/2` connected:** no phone is involved, so it's a local issue — check that `node-datachannel` installed correctly (`npm install`) and that no firewall blocks local UDP.

**If ADB network stats all show 0:** `adb devices` is returning nothing — reconnect the USB cable and re-enable USB Debugging.

> **Note on LAN "Delivered" accuracy:** For LAN mode, "delivered" means the TCP write was flushed to the OS buffer on the laptop — not a confirmed receipt from the app. LAN has no reverse acknowledgement path from the phone. WS mode uses server acks and is fully accurate.

---

## Running the Tests

Run all commands from inside the `stress-test/` folder.

### LAN mode (direct WiFi, no server needed)

```bash
npx ts-node src/runner.ts --mode lan --host-ip <YOUR_LAPTOP_IP>
```

What happens: The laptop advertises fake users on the local network. The Sapot app on the phone discovers them automatically (same way it finds real users) and connects. Each fake user sends encrypted messages at increasing rates.

### Server mode (relay through FastAPI)

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws --server-url https://<SERVER_IP>
```

`NODE_EXTRA_CA_CERTS` is **required** for `ws` (and `both`) mode — it points Node at the server's CA/self-signed certificate so the HTTPS/WSS connection can be verified. Omit it and login fails with a TLS error.

What happens: Fake users log in to the server and send messages through it, exactly like real Sapot users would when not on the same WiFi.

### Both modes in sequence

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode both \
  --host-ip <YOUR_LAPTOP_IP> \
  --server-url https://<SERVER_IP>
```

> `both` runs WS as one of its phases, so `NODE_EXTRA_CA_CERTS` is required here too.

### WebRTC mode (peer-to-peer, laptop-only)

```bash
npx ts-node src/runner.ts --mode webrtc --config stress-test.config.json
```

What happens: This mode does **not** involve the phone. It spins up pairs of simulated peers entirely on the laptop (via `node-datachannel`), wires their signaling **in-process** (no network hop for the SDP/ICE exchange), and establishes real `RTCPeerConnection`s between each pair. It measures ICE establishment time, `RTCDataChannel` chat latency, and — when `webrtc.media` is configured — synthetic RTP audio/video track load. Use it to stress the WebRTC connection-formation and media path itself, isolated from any transport variability.

- `peerCount` **must be even** (peers connect in pairs). The validator rejects odd counts in webrtc mode.
- The report adds a **WebRTC Connections** block showing pairs attempted, peers connected (`connected/total`), peers timed out, and ICE establish p50/p95/max. A **Call (media track)** block (RTP packets sent/lost, media establish p95) appears only when `media` is configured.

### TCP-signaled WebRTC mode (laptop-only, real LAN signaling path)

```bash
npx ts-node src/runner.ts --mode tcp-signaled --config stress-test.tcp-signaled.config.json
```

What happens: Like `webrtc`, this mode runs entirely on the laptop — no phone involved. Unlike `webrtc`, SDP offers/answers and ICE candidates are exchanged over real loopback TCP sockets using **exactly the same NaCl-encrypted framing the Sapot app uses** (ECDH handshake, `EncryptedEnvelope` frames). Each even-indexed peer is the offerer; it connects to the odd-indexed peer's TCP server. ICE then negotiates the WebRTC data channel over loopback.

Use this mode when you want to measure the overhead of the real signaling encryption layer (ECDH + NaCl box) on top of the WebRTC connection-formation path, without involving the server or the phone.

- Requires both `lan` (for `hostIp`) and `webrtc` sections in the config.
- `peerCount` **must be even**. Use `stress-test.tcp-signaled.config.json` as a starting point.
- Update `lan.hostIp` to your laptop's LAN IP (even for loopback tests, it's used to label the run).

### WS-signaled WebRTC mode (laptop-only, server relay signaling path)

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node src/runner.ts --mode ws-signaled --config stress-test.ws-signaled.config.json
```

What happens: Peers authenticate with the FastAPI server (same JWT flow as `ws` mode), open a WebSocket, and exchange SDP/ICE signals **through the server relay** — the same path the Sapot app uses for WebRTC signaling when peers are not on the same LAN. `NODE_EXTRA_CA_CERTS` is required when the server uses a self-signed certificate.

Use this mode to measure the end-to-end WebRTC connection-formation time when signaling must pass through the server, and to stress the server's WebSocket relay under many simultaneous signaling sessions.

- Requires both `ws` (for `serverUrl`, `accountPrefix`, `password`) and `webrtc` sections in the config.
- `peerCount` **must be even**. Seed the test accounts first (Setup step 4) if you haven't already.
- Use `stress-test.ws-signaled.config.json` as a starting point; update `ws.serverUrl` and `ws.password`.

### Override individual settings without editing the config

```bash
npx ts-node src/runner.ts --mode lan --host-ip 192.168.1.50 --output-dir ./my-results
```

---

## Measuring Raw Link Load with iperf

The delivery/latency metrics above measure the **app's** signaling behavior. Alongside them, the runner measures how the underlying **network link** holds up under heavy traffic — independent of the app — by driving [`iperf3`](https://iperf.fr/), the standard network-throughput tool. `iperf3` is a required dependency for LAN and WS runs: install it on the laptop and keep an `iperf3 -s` server running at the target IP (see [Prerequisites](#prerequisites)).

**How it's driven:** every phase carries an `iperfLoadMbps` field. In `lan`/`ws` modes the iperf target is derived automatically; in `webrtc` mode it runs only when you also set `webrtc.iperfTargetIp` (there is otherwise no network target for the laptop-only loopback peers):

```json
"phases": [
  { "peerCount": 10, "msgPerSec": 50, "durationSec": 20, "iperfLoadMbps": 100 },
  { "peerCount": 20, "msgPerSec": 50, "durationSec": 20, "iperfLoadMbps": 200 }
]
```

A ready-made example lives in `stress-test.iperf.json`:

```bash
npx ts-node src/runner.ts --mode lan --config stress-test.iperf.json
```

**Two stages.** The link is measured in two stages so you can separate the link's healthy capacity from how the stress traffic degrades it:

1. **Stage 1 — baseline (clean link).** Once per transport, *before any peers send traffic*, the runner takes a single clean `iperf3` measurement. This is the network's base performance with no stress.
2. **Stage 2 — under load (per phase).** For **each** phase, an `iperf3` measurement is started when the phase starts, runs concurrently with that phase's peer traffic, and is stopped and read back when the phase ends — then the next phase starts and the cycle repeats. Each phase therefore gets its own under-load number.

Both stages shell out to the same `iperf3` client:

```
iperf3 -c <targetIp> -u -b 0 -t <durationSec> -J
```

That's a UDP test (`-u`) at unlimited send rate (`-b 0`), with JSON output. Stage 1 runs for a fixed short baseline window; stage 2 runs for the phase's `durationSec`. The runner parses each result for real throughput, packet loss, jitter, and packet counts.

After the run, a **`iperf: BASELINE vs UNDER-LOAD`** block prints each phase's baseline row, its under-load row, and the delta (throughput drop %, loss change in percentage points, jitter change) — making the stress-induced degradation explicit.

**The target IP** is chosen automatically:

| Mode | iperf target |
|---|---|
| `lan` | `lan.iperfTargetIp` if set, otherwise `lan.hostIp` |
| `ws` | the hostname parsed from `ws.serverUrl` |
| `webrtc` | `webrtc.iperfTargetIp` if set, otherwise not run (no target) |
| `tcp-signaled` | `lan.iperfTargetIp` if set, otherwise `lan.hostIp` |
| `ws-signaled` | the hostname parsed from `ws.serverUrl` |

**Requirements (do this before every LAN/WS run):**

- The `iperf3` binary must be installed on the laptop (`iperf3 --version`).
- An `iperf3` **server** must be listening at the target IP — start it there with `iperf3 -s` before the run.
- If either is missing, iperf cannot measure the link: it logs `[iperf] Failed to start …`, the iperf columns show `-`, and you lose the link-level numbers (the app metrics still print, but the run is incomplete). Each measurement has a safety timeout (the baseline window plus a 10 s grace for stage 1; a 10 s grace after the phase ends for stage 2).

> **Note — `iperfLoadMbps` is a label, not a throttle.** The number you set is used only to name the phase (e.g. `lan-peers10-msg50-iperf100M`). The actual iperf client always runs at unlimited bitrate (`-b 0`), so the value does **not** cap or set the offered load. Use distinct numbers per phase mainly to label them in the results.

When at least one phase produced iperf data, three extra columns appear in the results table — `iMbps` (iperf throughput), `iLoss%` (iperf packet loss), and `iJitter` (iperf jitter) — and the saturation analysis prefers iperf's loss figure over the process-level estimate when flagging packet-loss thresholds.

---

## What the Test Phases Mean

The test runs through a series of "phases". Each phase increases the number of fake users at a realistic signaling rate (1-2 messages per second).

| Phase | What changes | Goal |
|---|---|---|
| Signaling Load (10-100 peers, 1 msg/s) | Ramps up concurrent peers | Find the max number of users the app can track/discover |
| Frequency Stress (50-100 peers, 2 msg/s) | Increased signaling rate | Simulate rapid renegotiation or high-frequency updates |

---

## Reading the Results

After the run, a table is printed in the terminal and a JSON file is saved to `./stress-results/`.

### Results table

```
Phase                  | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter
-----------------------|-------|-------|-----------|---------|------|-------|-------
lan-peers10-msg1       |    10 |     1 |    100.0% |       0 | 11ms |  19ms |   3ms
lan-peers50-msg1       |    50 |     1 |    100.0% |       0 | 15ms |  25ms |   5ms
lan-peers100-msg1      |   100 |     1 |     94.1% |      47 | 28ms | 120ms |  31ms
```

**What each column means:**

| Column | What it means | Healthy range |
|---|---|---|
| **Peers** | Number of simultaneous fake users active | — |
| **Msg/s** | Messages each user sends per second | — |
| **Delivered** | % of messages the app actually received | 99%+ is healthy; below 90% means the app is struggling |
| **Dropped** | Messages that were never confirmed received | 0 is ideal |
| **P50** | Half of all messages arrived faster than this (median latency) | Under 50 ms is good |
| **P95** | 95% of messages arrived faster than this | Under 200 ms is acceptable |
| **Jitter** | How much the latency varies from message to message | Low = stable; high = WiFi or app is overloaded |

**Where is the breaking point?** Find the first phase where **Delivered drops below ~95%** or **P95 jumps sharply** — that is the network limit.

### Network stats (bottom of output)

```
Network: 4.2 Mbps throughput | 3.8 Mbps goodput
WiFi: -61 dBm @ 144 Mbps | Loss: 0.3%
```

| Term | What it means |
|---|---|
| **Throughput** | Total data sent/received per second across all connections |
| **Goodput** | Actual useful message data per second (excludes protocol overhead) |
| **WiFi signal (dBm)** | Phone's WiFi signal strength. -50 to -60 = strong. -70 to -80 = weak. More negative = weaker. |
| **Link speed** | Max speed the phone's WiFi radio can use right now |
| **Loss %** | How often the phone had to re-request lost packets — high values mean WiFi congestion |

> **Note:** Network stats require ADB to be connected. If ADB is unavailable, those columns will show 0, but the delivery rate and latency columns still work correctly.

---

## Config File Reference (`stress-test.config.json`)

```json
{
  "mode": "both",          // "lan" | "ws" | "both" | "webrtc" | "tcp-signaled" | "ws-signaled"
  "lan": {
    "hostIp": "...",       // Your laptop's IP address on the WiFi network
    "startPort": 9000,     // First TCP port — each fake user gets its own (9000, 9001, ...)
    "iperfTargetIp": "..." // IP the iperf3 client connects to (see "Measuring raw link load
                           //   with iperf" below). Falls back to hostIp if omitted.
  },
  "ws": {
    "serverUrl": "...",    // FastAPI server address — https, no port (e.g. https://192.168.1.100)
    "accountPrefix": "stress_peer_",  // Prefix used for test account usernames
    "password": "..."      // Shared password for the seeded test accounts (must match the seed script)
  },
  "webrtc": {              // Required only for "webrtc" mode
    "connectionTimeoutMs": 10000,    // How long to wait for ICE to reach "connected"
    "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }],  // Optional STUN/TURN
    "iperfTargetIp": "...",          // Optional — host running `iperf3 -s`. Set it (plus a
                                     //   phase iperfLoadMbps) to also measure link load in
                                     //   webrtc mode; omitted = no iperf for webrtc.
    "media": {             // Optional — omit for data-channel-only (chat) tests
      "type": "audio",     // "audio" or "audio-video" — adds synthetic RTP track load
      "bitrate": 32        // Target kbps (used to size synthetic video frames)
    }
  },
  "phases": [
    {
      "peerCount": 50,     // Number of simultaneous fake users (must be EVEN for webrtc)
      "msgPerSec": 1,      // Messages each user sends per second
      "durationSec": 60,   // How long to hold this phase before moving on
      "iperfLoadMbps": 100 // Runs an iperf3 throughput test during this phase (lan/ws always;
                           //   webrtc only when webrtc.iperfTargetIp is set).
                           //   See note below: the number is a label only; iperf runs at
                           //   unlimited bitrate regardless.
    }
  ],
  "outputDir": "./stress-results"  // Where results JSON files are saved
}
```

---

## Glossary

Plain-language meanings of terms you'll see in this README and in the output. You don't need to memorize these to run the test.

| Term | What it means |
|---|---|
| **Peer** | One participant in a connection. A real peer is a phone; a **simulated** (or "fake") peer is one of the users this tool runs on your laptop. |
| **Simulated peer / fake user** | A program on your laptop that pretends to be a real Sapot user. The phone cannot tell it apart from a real one. |
| **Signaling** | The short "let's connect" handshake two devices exchange before a call starts (who they are, how to reach each other). This is the main thing being stress-tested. |
| **Relay (server mode)** | The phone and laptop don't talk directly — the FastAPI server sits in the middle and forwards messages. Used when they aren't on the same WiFi. |
| **mDNS** | The auto-discovery tech that lets devices find each other on a local network (the same thing that finds printers). Used in LAN mode. |
| **WebRTC** | The technology behind real-time voice/video calls. The `webrtc` test exercises this engine directly on the laptop. |
| **ICE** | The step where two peers figure out the best network path to reach each other before a WebRTC call connects. "ICE establish time" = how long that took. |
| **Data channel** | The WebRTC pipe used to send chat text (as opposed to the audio/video pipe). |
| **RTP** | The packet format used to stream audio/video during a call. "RTP packets sent/lost" measures call media health. |
| **Renegotiation** | When an in-progress connection has to re-do part of its setup (e.g. someone turns on their camera). Simulated by the higher message rates. |
| **Throughput / Goodput** | Total data moved per second / the useful-message portion of it (see [Reading the Results](#network-stats-bottom-of-output)). |

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| Phone seems ignored / test runs but the app does nothing | Config is still in the default `webrtc` (laptop-only) mode | Set `"mode"` to `"lan"`, `"ws"`, or `"both"`, or pass `--mode lan` |
| `adb: command not found` | ADB not installed | Install Android Platform Tools |
| `adb devices` shows nothing | USB debugging not enabled on phone | Enable Developer Options → USB Debugging |
| `adb devices` shows `unauthorized` | Phone hasn't accepted the RSA key prompt | Unlock the phone and accept the "Allow USB debugging?" dialog |
| App never discovers LAN peers | Phone and laptop on different networks | Make sure both are on the same router (not guest vs. main) |
| LAN delivery drops to 0% mid-test | App went to background or screen locked | Keep the app in the foreground; disable screen timeout during the test |
| `Login failed for stress_peer_0` | Test accounts not seeded | Run the seed script (Setup step 4 above) |
| All phases show 0% delivery | Wrong `hostIp` in config | Update `lan.hostIp` to your actual laptop IP |
| All phases show 0% delivery (LAN) | Laptop firewall blocking inbound TCP | Run `sudo ufw allow 9000:9100/tcp` |
| `EADDRINUSE` on start | Previous test crashed and left ports open | Wait 30 s or reboot, then retry |
| Network stats all show 0 | ADB not connected or no device found | Check `adb devices`; reconnect USB cable |
| LAN Delivered shows 100% but app receives nothing | LAN "delivered" = TCP buffer flushed, not app receipt | Confirm visually that messages appear in the app; use WS mode for accurate end-to-end delivery tracking |
| iperf columns show `-` / `[iperf] Failed to start` | `iperf3` not installed, or no `iperf3 -s` server at the target IP | Install `iperf3` on the laptop; run `iperf3 -s` on the target host (`lan.iperfTargetIp` / WS server) before the run |
| `iperf` connects but throughput is near 0 / high loss | Firewall blocking the iperf UDP port (5201 by default) at the target | Allow UDP 5201 inbound on the target host, or point `iperfTargetIp` at a reachable machine |
| `tcp-signaled`: peers time out / 0 connected | ICE failing over loopback | Try adding `"iceServers": []` explicitly; check no firewall blocks loopback UDP |
| `ws-signaled`: `Login failed for stress_0` | Test accounts not seeded | Run the seed script (Setup step 4) with `--count` ≥ `peerCount` |
| `ws-signaled`: peers connect but ICE never completes | Server relay too slow for ICE candidate exchange | Increase `webrtc.connectionTimeoutMs` (try `20000`); check server latency |
