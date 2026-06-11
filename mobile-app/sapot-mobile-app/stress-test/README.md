# Sapot Stress Test

A tool that finds the limits of the Sapot app's networking by simulating many fake users ("peers") connecting to it from your laptop.

---

## Background: How Sapot Connects Devices

Sapot supports two ways for devices to talk to each other:

- **LAN mode (direct)** — Devices on the same WiFi network connect directly to each other over TCP (like a local file share). The phone and the laptop discover each other automatically using mDNS (the same technology that lets you find printers on a local network). No internet required.

- **Server mode (relay)** — Messages are sent to a FastAPI server and the server forwards them to the recipient. This works over the internet but adds one extra hop.

This stress test simulates up to 50 fake users ("simulated peers") running on your laptop. These fake users speak exactly the same encrypted protocol as the real Sapot app so the phone cannot tell the difference.

**What we are measuring:** how many fake users and how many messages per second the app can handle before it starts dropping messages or slowing down.

---

## Prerequisites

Before running the stress test, you need:

| Requirement | Why | How to check |
|---|---|---|
| Physical Android device + USB cable | The stress test targets a real app running on a real device | `adb devices` — should list your device |
| ADB (Android Debug Bridge) installed | Used to read network stats from the device | `adb version` |
| Sapot app running on the phone | The thing being tested | Open the app on the phone |
| Phone and laptop on the **same WiFi** | LAN mode only works on a local network | Both connected to the same router |
| Node.js 18+ installed on laptop | Runs the simulator | `node --version` |
| FastAPI server running (WS mode only) | Needed for server relay tests | `curl http://<SERVER_IP>:8000/health` |

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
npx ts-node scripts/seed-test-accounts.ts \
  --server-url http://<SERVER_IP>:8000 \
  --count 60
```

You only need to run this once — accounts persist in the database.

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

### Override individual settings without editing the config

```bash
npx ts-node src/runner.ts --mode lan --host-ip 192.168.1.50 --output-dir ./my-results
```

---

## What the Test Phases Mean

The test runs through a series of "phases". Each phase increases either the number of fake users or the message rate, then holds steady so we can measure stability.

| Phase | What changes | Goal |
|---|---|---|
| Warmup (1 peer, 1 msg/s, 30 s) | Just 1 fake user sending slowly | Confirm the basic connection works |
| Peer ramp ×5 / ×10 / ×20 / ×50 | More fake users, same message rate | Find the max number of users before things break |
| Throughput ×10 / ×50 / ×100 / ×200 | Same users, faster message rate | Find the max messages/sec before things break |
| Combined (20 peers × 50 msg/s) | Many users sending many messages | Worst-case sustained load |

---

## Reading the Results

After the run, a table is printed in the terminal and a JSON file is saved to `./stress-results/`.

### Results table

```
Phase              | Peers | Msg/s | Delivered | Dropped | P50  | P95   | Jitter
-------------------|-------|-------|-----------|---------|------|-------|-------
Warmup             |     1 |     1 |    100.0% |       0 |  9ms |  14ms |   2ms
Peer ramp ×5       |     5 |     5 |    100.0% |       0 | 11ms |  19ms |   3ms
Peer ramp ×20      |    20 |     5 |     94.1% |      47 | 28ms | 120ms |  31ms
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
  "mode": "both",          // Which transport to test: "lan", "ws", or "both"
  "lan": {
    "hostIp": "...",       // Your laptop's IP address on the WiFi network
    "startPort": 9000      // First TCP port — each fake user gets its own (9000, 9001, ...)
  },
  "ws": {
    "serverUrl": "...",    // FastAPI server address (http:// or https://)
    "accountPrefix": "stress_peer_"  // Prefix used for test account usernames
  },
  "phases": [
    {
      "peerCount": 5,      // Number of simultaneous fake users in this phase
      "msgPerSec": 5,      // Messages each user sends per second
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
| App never discovers LAN peers | Phone and laptop on different networks | Make sure both are on the same router (not guest vs. main) |
| `Login failed for stress_peer_0` | Test accounts not seeded | Run the seed script (Setup step 3 above) |
| All phases show 0% delivery | Wrong `hostIp` in config | Update `lan.hostIp` to your actual laptop IP |
| `EADDRINUSE` on start | Previous test crashed and left ports open | Wait 30 s or reboot, then retry |
| Network stats all show 0 | ADB not connected or no device found | Check `adb devices`; reconnect USB cable |
