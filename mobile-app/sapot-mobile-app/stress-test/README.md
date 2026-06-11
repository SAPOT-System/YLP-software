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

## The Mobile App's Role

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
| FastAPI server running (WS mode only) | Needed for server relay tests | `curl http://<SERVER_IP>:8000/health` |
| **Firewall allows TCP 9000–9100 inbound** (LAN mode) | The phone connects inbound to the simulated peers on those ports | `sudo ufw status` — add rules if needed: `sudo ufw allow 9000:9100/tcp` |

---

## Setup

**1. Install dependencies** (once, from inside the `stress-test/` folder):

```bash
cd stress-test
npm install
```

**2. Edit the config** to match your network.

Open `stress-test/stress-test.config.json` and update two fields:

```json
{
  "lan": {
    "hostIp": "192.168.1.100"   ← change to YOUR laptop's IP on the WiFi
  },
  "ws": {
    "serverUrl": "http://192.168.1.100:8000"   ← change to the server's IP
  }
}
```

To find your laptop's IP: run `ip addr show | grep "inet " | grep -v 127.0.0.1` (Linux/Mac).

**3. Seed test accounts** (WS mode only — run once before the first WS test):

The server relay tests log in as real users. This script creates the test accounts:

```bash
NODE_EXTRA_CA_CERTS=/path/to/server.crt npx ts-node scripts/seed-test-accounts.ts \
  --server-url https://<SERVER_IP>:8000 \
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
```

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
curl http://<SERVER_IP>:8000/health
# expected: {"status": "ok"} or similar 200 response
```

### Step 5 — Run a 1-peer smoke test

This is the fastest way to confirm everything works end-to-end before the full run. It runs a single fake peer for 20 seconds and should show ~100% delivery.

**LAN mode smoke test:**
```bash
npx ts-node src/runner.ts --mode lan --host-ip <YOUR_LAPTOP_IP> --config stress-test.config.json
```

Before running, temporarily edit `stress-test.config.json` phases to a single entry:
```json
"phases": [{ "peerCount": 1, "msgPerSec": 1, "durationSec": 20 }]
```

**Expected output (setup is working):**
```
Phase                  | Peers | Msg/s | Delivered | Dropped | P50  | P95
-----------------------|-------|-------|-----------|---------|------|-----
lan-peers1-msg1        |     1 |     1 |    100.0% |       0 | <50ms| <100ms
```

**If Delivered shows 0%:** the phone is not connecting. Check:
1. `lan.hostIp` in config matches your actual WiFi IP
2. Firewall allows TCP 9000+ inbound (`sudo ufw allow 9000:9100/tcp`)
3. App is in the foreground on the peer list screen
4. Phone and laptop are on the same WiFi (not guest vs. main)

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
npx ts-node src/runner.ts --mode ws --server-url http://<SERVER_IP>:8000
```

What happens: Fake users log in to the server and send messages through it, exactly like real Sapot users would when not on the same WiFi.

### Both modes in sequence

```bash
npx ts-node src/runner.ts --mode both \
  --host-ip <YOUR_LAPTOP_IP> \
  --server-url http://<SERVER_IP>:8000
```

### WebRTC mode (peer-to-peer, laptop-only)

```bash
npx ts-node src/runner.ts --mode webrtc --config stress-test.config.json
```

What happens: This mode does **not** involve the phone. It spins up pairs of simulated peers entirely on the laptop (via `node-datachannel`), wires their signaling in-process, and establishes real `RTCPeerConnection`s between each pair. It measures ICE establishment time, `RTCDataChannel` chat latency, and — when `webrtc.media` is configured — synthetic RTP audio/video track load. Use it to stress the WebRTC connection-formation and media path itself rather than the TCP/WS signaling transports.

- `peerCount` **must be even** (peers connect in pairs). The validator rejects odd counts in webrtc mode.
- The report adds a **WebRTC Connections** block showing pairs attempted, peers connected (`connected/total`), peers timed out, and ICE establish p50/p95/max. A **Call (media track)** block (RTP packets sent/lost, media establish p95) appears only when `media` is configured.

### Override individual settings without editing the config

```bash
npx ts-node src/runner.ts --mode lan --host-ip 192.168.1.50 --output-dir ./my-results
```

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
  "mode": "both",          // Which transport to test: "lan", "ws", "both", or "webrtc"
  "lan": {
    "hostIp": "...",       // Your laptop's IP address on the WiFi network
    "startPort": 9000      // First TCP port — each fake user gets its own (9000, 9001, ...)
  },
  "ws": {
    "serverUrl": "...",    // FastAPI server address (http:// or https://)
    "accountPrefix": "stress_peer_"  // Prefix used for test account usernames
  },
  "webrtc": {              // Required only for "webrtc" mode
    "connectionTimeoutMs": 10000,    // How long to wait for ICE to reach "connected"
    "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }],  // Optional STUN/TURN
    "media": {             // Optional — omit for data-channel-only (chat) tests
      "type": "audio",     // "audio" or "audio-video" — adds synthetic RTP track load
      "bitrate": 32        // Target kbps (used to size synthetic video frames)
    }
  },
  "phases": [
    {
      "peerCount": 50,     // Number of simultaneous fake users (must be EVEN for webrtc)
      "msgPerSec": 1,      // Messages each user sends per second
      "durationSec": 60    // How long to hold this phase before moving on
    }
  ],
  "outputDir": "./stress-results"  // Where results JSON files are saved
}
```

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `adb: command not found` | ADB not installed | Install Android Platform Tools |
| `adb devices` shows nothing | USB debugging not enabled on phone | Enable Developer Options → USB Debugging |
| `adb devices` shows `unauthorized` | Phone hasn't accepted the RSA key prompt | Unlock the phone and accept the "Allow USB debugging?" dialog |
| App never discovers LAN peers | Phone and laptop on different networks | Make sure both are on the same router (not guest vs. main) |
| LAN delivery drops to 0% mid-test | App went to background or screen locked | Keep the app in the foreground; disable screen timeout during the test |
| `Login failed for stress_peer_0` | Test accounts not seeded | Run the seed script (Setup step 3 above) |
| All phases show 0% delivery | Wrong `hostIp` in config | Update `lan.hostIp` to your actual laptop IP |
| All phases show 0% delivery (LAN) | Laptop firewall blocking inbound TCP | Run `sudo ufw allow 9000:9100/tcp` |
| `EADDRINUSE` on start | Previous test crashed and left ports open | Wait 30 s or reboot, then retry |
| Network stats all show 0 | ADB not connected or no device found | Check `adb devices`; reconnect USB cable |
| LAN Delivered shows 100% but app receives nothing | LAN "delivered" = TCP buffer flushed, not app receipt | Confirm visually that messages appear in the app; use WS mode for accurate end-to-end delivery tracking |
