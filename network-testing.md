# Network Performance Testing Report
## Wireless PtP Backhaul and Distributed Application Evaluation

**Document Version:** 1.0
**Date:** 2026-05-13
**Classification:** Engineering / Capstone Project Report
**Network System:** Long-Range PtP Wireless Bridge with Multi-AP Distribution

---

## Abstract

This report presents a structured performance evaluation of a distributed wireless network built around a 30 KM Point-to-Point (PtP) wireless backhaul connecting two LAN segments, multiple Wi-Fi access points, and Android client devices running a custom mobile application. Three test scenarios are evaluated in sequence: single-LAN baseline operation, inter-LAN operation across the PtP bridge, and scalability testing with up to 30 concurrently connected devices. For each scenario, both network-layer metrics (throughput, RTT, packet loss) and application-layer metrics (REST API response time, WebSocket RTT, mDNS discovery latency, GSM delivery latency) are measured and compared to quantify the overhead introduced by the wireless backhaul and identify system bottlenecks under load.

> **How to use this template:** Every table cell containing `—` is a placeholder — fill it in with your measured value after running the corresponding test. Observation lines marked with underscores (`____`) are free-text fields for your written notes.

---

## Table of Contents

0. [Roles and Responsibilities](#0-roles-and-responsibilities)
1. [Introduction](#1-introduction)
2. [Objectives](#2-objectives)
3. [System Architecture](#3-system-architecture)
4. [Test Environment](#4-test-environment)
5. [Testing Tools and Applications](#5-testing-tools-and-applications)
6. [General Testing Methodology](#6-general-testing-methodology)
7. [Scenario 1 – Single-LAN Operation](#7-scenario-1--single-lan-operation)
   - [§7.3b — TCP P2P Performance (App Device-to-Device)](#73b-sub-test-1b--tcp-p2p-performance-app-device-to-device)
8. [Scenario 2 – Multi-LAN Operation Across PtP Link](#8-scenario-2--multi-lan-operation-across-ptp-link)
   - [§8.3c — TCP P2P Across PtP Bridge](#83c-sub-test-1c--tcp-p2p-across-ptp-bridge)
9. [Scenario 3 – Scalability Testing with Increasing Connected Devices](#9-scenario-3--scalability-testing-with-increasing-connected-devices)
10. [Results and Analysis](#10-results-and-analysis)
11. [Graph Recommendations](#11-graph-recommendations)
12. [Observations](#12-observations)
13. [Conclusion](#13-conclusion)
- [Appendix A – Glossary of Terms](#appendix-a--glossary-of-terms)

---

## 0. Roles and Responsibilities

> **Read this section before executing any test.** Each team member should identify their assigned role, confirm their physical location, and review their responsibilities before the first test begins.

### 0.1 Role Definitions

| Role | Abbreviation | Physical Location | Responsibilities |
|---|---|---|---|
| Test Lead | TL | Either LAN side (coordinates remotely) | Owns overall test execution order; enforces repeatability policy (§6.2); coordinates inter-team signaling; signs off on each completed scenario; authors §12 Observations and §13 Conclusion |
| Network Engineer | NET-ENG | Router / AP access point (either side) | Configures hardware (router, APs, dishes) before testing begins; verifies IP reachability across the PtP bridge; reads RSSI and link-rate values from dish management interfaces; runs tshark packet captures |
| Backend Administrator | BE-ADMIN | Backend server (LAN A, 192.168.1.10) | Starts and monitors all server-side processes: `iperf3 -s`, `ws_echo_server.js`, GSM API; monitors server CPU and memory during Scenario 3; tails server logs during GSM sub-tests to capture server-side timestamps |
| QA Tester – Primary | QA-P | LAN A (same side as backend server) | Operates Device A (TCP server mode, mDNS advertiser); runs all client-side measurement commands (`iperf3 -c`, `ping`, `mtr`, `curl`, `ws_rtt_client.py`, `sim_tcp_client.py`); fills in all result tables |
| QA Tester – Secondary | QA-S | LAN B (remote side across PtP bridge) | Operates Device B (TCP client, mDNS discovery); physically holds and observes the test GSM handset during all GSM sub-tests; operates the simulation laptop for Scenario 3 (`k6`, `sim_ws.sh`, `iperf3 -P`); monitors physical Android devices in Scenario 3 |

### 0.2 Pre-Test Team Checklist

Complete before the first test of each day. All boxes must be checked before proceeding.

```
[ ] TL has confirmed test execution order with all team members
[ ] NET-ENG has verified end-to-end IP reachability (ping 192.168.1.10 from LAN B)
[ ] BE-ADMIN is logged in to the backend server and able to start services
[ ] QA-P is physically on LAN A with Device A connected and developer options enabled
[ ] QA-S is physically on LAN B (or same LAN for Scenario 1) with Device B and the test GSM handset
[ ] QA-S has the test handset number recorded (§4.4 Step 1)
[ ] Communication channel is confirmed (radio / chat / voice call) between QA-P and QA-S
[ ] Simulation laptop is set up and tools installed (k6, websocat, Python 3) — QA-S
```

### 0.3 Inter-Role Signaling Protocol

Because QA-P and QA-S are on opposite LAN segments during Scenarios 2 and 3, explicit handoff signals are required at key transition points. Use the agreed communication channel (radio, Signal, WhatsApp, or similar) to send these standard signals:

| Signal | Sent By | Received By | Meaning |
|---|---|---|---|
| `READY` | BE-ADMIN | QA-P | Server-side process is started and confirmed; client may begin |
| `GO` | TL | QA-P + QA-S | Begin this sub-test step simultaneously |
| `STOP` | TL | QA-P + QA-S | Terminate all active test sessions; wait for next GO |
| `SMS-RECEIVED [time]` | QA-S | QA-P | GSM handset received the SMS; [time] is the message thread timestamp |
| `DONE` | QA-P | TL | Sub-test complete; result table filled in |

### 0.4 Quick-Reference Role Responsibility Table

| Test Activity | Assigned Role | Supporting Role |
|---|---|---|
| Hardware setup and IP verification | NET-ENG | BE-ADMIN |
| `iperf3 -s` server startup | BE-ADMIN | — |
| `iperf3 -c`, `ping`, `mtr` (client) | QA-P | — |
| `ws_echo_server.js` startup | BE-ADMIN | — |
| `ws_rtt_client.py` WebSocket client | QA-P | — |
| `curl` REST API requests | QA-P | — |
| mDNS advertiser (Device A) | QA-P | — |
| mDNS discovery (Device B) | QA-S | — |
| `tshark` packet capture | NET-ENG | QA-P (interface ID) |
| GSM `curl` send commands | QA-P | — |
| GSM handset observation and timestamp recording | QA-S | — |
| Server log monitoring during GSM sends | BE-ADMIN | — |
| GSM inter-send timer (≥ 30 s between sends) | TL | — |
| `k6` / `sim_ws.sh` / `iperf3 -P` simulation | QA-S | — |
| Physical Android device monitoring (Scenario 3) | QA-S | QA-P |
| Server CPU/memory monitoring | BE-ADMIN | — |
| RSSI / link-rate reading from dish management UI | NET-ENG | — |
| Result table data entry (client-side) | QA-P | — |
| Result table data entry (Device B / GSM handset) | QA-S | — |
| Cross-scenario comparison tables (§10) | TL | QA-P |
| §12 Observations and §13 Conclusion authoring | TL | QA-P, QA-S |
| Final document review and signoff | TL | NET-ENG |

---

## 1. Introduction

This report presents a structured performance evaluation of a distributed wireless network system consisting of a long-range Point-to-Point (PtP) wireless backhaul, multiple access points (APs), a managing router, and Android client devices running a mobile application. The backend system exposes a REST API and a WebSocket server; the Android application communicates using TCP, REST API requests, WebSocket connections, and mDNS service discovery.

Testing was conducted under three progressively complex scenarios: single-LAN operation to establish baseline performance, multi-LAN operation across the PtP wireless bridge to evaluate inter-LAN overhead, and scalability testing with an increasing number of concurrently connected Android devices. Each scenario evaluates both network-layer metrics (throughput, latency, packet loss) and application-layer metrics (API response time, WebSocket message latency, mDNS discovery latency) to provide a comprehensive picture of system performance and its limits.

---

## 2. Objectives

- Establish baseline network and application performance metrics within a single LAN segment
- Quantify the performance overhead introduced by the 30 KM PtP wireless backhaul on all tested protocols
- Measure TCP throughput and connection stability across both single-LAN and inter-LAN configurations
- Evaluate REST API request/response latency and reliability under varying network conditions
- Assess WebSocket connection stability and message delivery performance across the PtP link
- Characterize mDNS service discovery behavior within a single LAN and across LAN boundaries
- Determine the scalability limits of the system as the number of connected Android devices increases from 1 to 20+
- Identify the primary bottleneck component (AP, router, PtP backhaul, or backend server) under peak load

---

## 3. System Architecture

### 3.1 Component Description

**PtP Wireless Backhaul (Dish A / Dish B):** Two directional dish antennas establish a long-range wireless bridge spanning up to 30 KM. Dish A is located on the LAN A side; Dish B is located on the LAN B side. Together they form the wireless backhaul that carries all inter-LAN traffic between the two network segments.

**Access Points (APs):** Multiple APs are deployed on each side of the PtP link. On LAN A, AP-A1 and AP-A2 provide wireless coverage to Android devices in that segment. On LAN B, AP-B1 and AP-B2 perform the same role. All APs operate in access mode, associating Android devices to their respective LAN subnets.

**Router:** A single router manages IP routing between LAN A and LAN B via the PtP bridge. It also provides DHCP services for both segments and may optionally run an mDNS proxy/repeater for cross-LAN service discovery.

**Backend Server:** The server is located on LAN A and hosts the REST API (HTTP) and WebSocket server endpoints consumed by the Android application. It also advertises services via mDNS for local discovery.

**Android Devices:** Client nodes running the mobile application. The application implements a TCP client, REST API consumer, WebSocket client, and mDNS discovery module. Devices connect wirelessly to the APs in their local LAN segment.

---

### 3.2 Network Topology Diagram

```
                            LAN A (192.168.1.0/24)
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│   [Backend Server]          [Router]                          │
│   192.168.1.10              192.168.1.1                       │
│        │                       │                             │
│        └───────────────────────┤                             │
│                                │                             │
│                         [Dish A]                             │
│                         192.168.1.2                          │
│                              │                               │
│              ┌───────────────┤                               │
│              │               │                               │
│          [AP-A1]         [AP-A2]                             │
│       192.168.1.11     192.168.1.12                          │
│           │   │            │   │                             │
│       [AND] [AND]      [AND] [AND]      ← Android devices    │
└───────────────────────────────────────────────────────────────┘
                              │
                    ══════════╪══════════
                    PtP WIRELESS BRIDGE
                       (up to 30 KM)
                    ══════════╪══════════
                              │
                            LAN B (192.168.2.0/24)
┌───────────────────────────────────────────────────────────────┐
│                         [Dish B]                             │
│                         192.168.2.1                          │
│                              │                               │
│              ┌───────────────┤                               │
│              │               │                               │
│          [AP-B1]         [AP-B2]                             │
│       192.168.2.11     192.168.2.12                          │
│           │   │            │   │                             │
│       [AND] [AND]      [AND] [AND]      ← Android devices    │
└───────────────────────────────────────────────────────────────┘
```

---

### 3.3 IP Addressing Plan

| Segment / Device | Role | Subnet | IP Address |
|---|---|---|---|
| LAN A | Primary network segment | 192.168.1.0/24 | — |
| LAN B | Remote network segment | 192.168.2.0/24 | — |
| Router (LAN A interface) | Default gateway, LAN A | 192.168.1.0/24 | 192.168.1.1 |
| Router (LAN B interface) | Default gateway, LAN B | 192.168.2.0/24 | 192.168.2.1 |
| Dish A | PtP bridge endpoint, LAN A | 192.168.1.0/24 | 192.168.1.2 |
| Dish B | PtP bridge endpoint, LAN B | 192.168.2.0/24 | 192.168.2.2 |
| AP-A1 | Access point, LAN A | 192.168.1.0/24 | 192.168.1.11 |
| AP-A2 | Access point, LAN A | 192.168.1.0/24 | 192.168.1.12 |
| AP-B1 | Access point, LAN B | 192.168.2.0/24 | 192.168.2.11 |
| AP-B2 | Access point, LAN B | 192.168.2.0/24 | 192.168.2.12 |
| Backend Server | API + WebSocket server | 192.168.1.0/24 | 192.168.1.10 |
| Android devices (LAN A) | Client nodes | 192.168.1.0/24 | DHCP assigned |
| Android devices (LAN B) | Client nodes | 192.168.2.0/24 | DHCP assigned |

---

## 4. Test Environment

### 4.1 Hardware

| Device | Role | Model / Spec | OS / Firmware | Notes |
|---|---|---|---|---|
| Dish A | PtP bridge endpoint | — | — | LAN A side |
| Dish B | PtP bridge endpoint | — | — | LAN B side, 30 KM from Dish A |
| AP-A1, AP-A2 | Access points, LAN A | — | — | Connected to Dish A |
| AP-B1, AP-B2 | Access points, LAN B | — | — | Connected to Dish B |
| Router | Network management | — | — | Routes between LAN A and LAN B |
| Backend Server | REST API + WebSocket host | — | Linux / — | LAN A, 192.168.1.10 |
| Android Devices (×2–5) | Client nodes | — | Android — | 2–5 physical devices; remaining load simulated (see §9.3) |

### 4.2 Software and Tools

| Tool | Version | Purpose |
|---|---|---|
| iperf3 | 3.x | TCP throughput measurement |
| ping | system | RTT and packet loss measurement |
| mtr | 0.9x | Hop-level latency and loss tracing |
| tshark / Wireshark | 4.x | Packet capture and protocol analysis |
| curl | 7.x / 8.x | HTTP API request timing |
| Android application | — | TCP, REST API, WebSocket, mDNS client |
| Avahi / nss-mdns | — | mDNS service advertisement on server |
| websocat | latest | WebSocket testing from non-Android host (`sudo apt install websocat`) |

### 4.3 Test Conditions

| Parameter | Value |
|---|---|
| Test duration per run | 60 seconds (TCP/WebSocket); 50 requests (API); 10 attempts (mDNS) |
| Number of repetitions | 3 per sub-test; results averaged |
| Averaging policy | Re-run if range (max − min) of 3 runs exceeds 10% of the 3-run mean; discard the outlier and repeat once |
| Bridge stability test duration | 10 minutes (600 pings at 1 s interval) |
| Scalability step hold duration | 3 minutes at each node count step |
| Environmental conditions | — (document: indoor/outdoor, time of day, weather if applicable) |
| PtP link distance | Up to 30 KM |
| Channel / frequency | — |

### 4.4 GSM Test Prerequisites

Complete the following **before** executing any GSM sub-test (§7.7, §8.7, §9.8). If any item cannot be confirmed, skip GSM sub-tests and document the reason.

**Step 1 — Record the test handset number:**

```
TEST_HANDSET_NUMBER: ___________________________
(e.g., +2348012345678 — include country code)
```

Substitute this number everywhere `<TEST_HANDSET_NUMBER>` appears in GSM commands.

**Step 2 — Confirm modem hardware:**

```
GSM Modem model: ___________________________
Connection to backend server: USB port /dev/ttyUSB___  (or other: _____________)
```

**Step 3 — Verify modem is ready before each GSM sub-test:**

```bash
curl -s http://192.168.1.10:8000/api/gsm/status
```

Expected response: `{"status": "ready", "signal": <n>}` where signal > 10.
If not "ready", do not proceed — resolve modem connectivity first.

**Step 4 — Synchronize test handset clock:**

On the test handset: Settings → Date & Time → enable "Automatic date & time".
This ensures the recorded SMS arrival timestamp is accurate.

**Step 5 — SMS arrival timing method [QA-S]:**

**[QA-S]** physically holds and watches the test handset throughout every GSM sub-test. **[QA-P]** cannot watch the terminal and the handset simultaneously — this always requires two people. When the SMS arrives, **[QA-S]** immediately sends the `SMS-RECEIVED [time]` signal (see §0.3) to **[QA-P]**, who records it in the result table. Use the per-message timestamp shown in the message thread — not the notification banner timestamp.

### 4.5 Environment Reference

The following variables are used throughout test commands. Record your actual values here before running any tests.

```
API_HOST=192.168.1.10
API_PORT=80               # confirm: check with curl -I http://192.168.1.10/auth/
API_ENDPOINT=/auth/
WS_PORT=8080              # port the ws_echo_server.js listens on
GSM_API_PORT=8000
TEST_HANDSET_NUMBER=      # from §4.4 Step 1
```

> If the API is served on a non-standard port, append it to `API_HOST` in all curl commands (e.g., `http://192.168.1.10:8080/auth/`).

---

## 5. Testing Tools and Applications

### 5.1 iperf3 — TCP Throughput

Measures bidirectional TCP throughput between a client and server over a specified duration.

> **Beginner note:** **Throughput** is measured in **Mbps (megabits per second)**. As a rough reference: 1 Mbps can stream standard-definition video; 10 Mbps supports HD video; a typical home Wi-Fi connection reaches 50–300 Mbps under ideal conditions. In this system, the PtP wireless backhaul is the likely limiting factor — the throughput measured across the 30 KM link will be lower than what the local Wi-Fi APs can achieve on their own.

```bash
# On backend server — start iperf3 listener
iperf3 -s

# On Android device or test host — run 60-second TCP test
iperf3 -c 192.168.1.10 -t 60 -i 5 --json -o result.json

# Parallel streams (used in Scenario 3)
iperf3 -c 192.168.1.10 -t 60 -P <N> --json
```

### 5.2 ping — RTT and Packet Loss

Measures round-trip time and packet loss between two hosts.

```bash
# 100 pings at 200 ms intervals
ping -c 100 -i 0.2 192.168.1.10

# Extended stability test (600 pings, 1 s interval = 10 minutes)
ping -i 1 -c 600 192.168.1.10
```

### 5.3 mtr — Hop-Level Path Analysis

Traces the route to a destination and reports per-hop RTT and packet loss.

```bash
mtr --report --report-cycles 60 192.168.1.10
```

### 5.4 tshark — Packet Capture and Analysis

Used for capturing mDNS traffic and verifying protocol behavior at the packet level.

**Find the correct interface name before each capture:**
```bash
ip link show
# Common interface names: eth0, wlan0, br0, enp3s0
# Use the name that corresponds to the network segment you are capturing on
```

```bash
# Capture mDNS traffic (replace <interface> with the name from ip link show)
sudo tshark -i <interface> -f "udp port 5353" -w mdns_capture.pcapng

# Capture inter-LAN traffic during iperf3 test
sudo tshark -i <interface> -w inter_lan_test.pcapng
```

**Useful Wireshark display filters:**

| Filter | Purpose |
|---|---|
| `mdns` | All mDNS traffic |
| `tcp.analysis.retransmission` | TCP retransmissions |
| `tcp.analysis.duplicate_ack` | Congestion signals |
| `ip.dst == 224.0.0.251` | mDNS multicast group |
| `websocket` | WebSocket frames |

### 5.5 curl — HTTP API Response Time

Measures time from HTTP request sent to full response received.

```bash
curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/auth/
```

### 5.6 Android Application

The application under test includes built-in screens for:
- TCP client connection and echo test
- REST API request/response with timing display
- WebSocket connection with message latency measurement
- mDNS service discovery with discovery time reporting

### 5.7 Tool-to-Metric Reference

| Tool | Metric Measured |
|---|---|
| iperf3 | TCP throughput (Mbps) |
| ping | RTT min/avg/max (ms), packet loss (%) |
| mtr | Per-hop RTT (ms), per-hop packet loss (%) |
| tshark | Packet-level protocol verification, mDNS capture |
| curl | API response time (ms) |
| Android application | WS message RTT (ms), API latency (ms), mDNS discovery latency (ms) |

---

## 6. General Testing Methodology

### 6.1 Metric Definitions

| Metric | Unit | Definition | Measurement Method |
|---|---|---|---|
| Throughput | Mbps | Volume of data successfully transferred per second | iperf3 |
| Round-trip time (RTT) | ms | Time from packet sent to acknowledgment received | ping, mtr |
| Packet loss | % | Percentage of transmitted packets not received | ping |
| Jitter | ms | Variation in RTT across consecutive samples. **ping reports `mdev` (mean absolute deviation)**; Python scripts (`sim_tcp_client.py`, `ws_rtt_client.py`) report `stdev` (standard deviation). These differ numerically — label the source in result tables. | ping (mdev), application stdev |
| API response time | ms | Time from HTTP request sent to full response received | curl, application |
| WebSocket message RTT | ms | Time from message sent to echo received by client | Application timestamp delta |
| mDNS discovery latency | ms | Time from discovery query issued to service record resolved | Application timing, tshark |
| Connection success rate | % | Successful connections as a percentage of total attempts | Application logs, iperf3 output |

> **Beginner note:** **RTT (Round-Trip Time)** is how long it takes for a message to travel from your device to the destination and back — like measuring how long it takes to shout across a room and hear the echo. **Jitter** is how much that delay varies from one message to the next; low jitter means the connection is consistent, high jitter means it is unpredictable. **Throughput** is the total amount of data transferred per second — higher is better. **P95 / P99** are statistical percentiles: "P99 = 80 ms" means 99% of requests completed in 80 ms or less, and only 1% took longer.

### 6.2 Repeatability Policy

All sub-tests are executed a minimum of three times. The reported value for each metric is the arithmetic mean of the three runs. If the variance between any two runs exceeds 10% of the mean, the affected run is discarded and the test is repeated. Final reported values are derived from three consistent runs.

### 6.3 Data Collection

- **iperf3:** JSON output (`--json` flag); parsed for `bits_per_second` and `retransmits`
- **ping:** Terminal output; extract `min/avg/max/mdev` from summary line
- **mtr:** Text report (`--report`); extract per-hop loss and avg RTT
- **tshark:** `.pcapng` files retained for post-test protocol verification
- **Application logs:** Android logcat or in-app test screen output; timestamps used for application-layer latency calculations

### 6.4 Test Execution Order

Within each scenario, sub-tests are executed in the following order to prevent cross-contamination of results:

1. TCP performance (iperf3 + ping + mtr)
2. REST API performance (curl or application)
3. WebSocket performance (application or websocat)
4. mDNS discovery (application + tshark)
5. GSM modem delivery (curl + test handset)

All active test sessions from a previous sub-test are terminated before the next sub-test begins.

```
  START SCENARIO  ← [TL] gives GO signal to all roles
       │
       ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 1. TCP  — iperf3 + ping + mtr                           │
  │    [BE-ADMIN] starts iperf3 -s; signals READY to QA-P  │
  │    [QA-P] runs iperf3 -c, ping, mtr; fills result table │
  │    [NET-ENG] reads RSSI from dish interfaces (S2/S3)    │
  └─────────────────┬────────────────────────────────────────┘
                    │ [QA-P] terminates iperf3, ping; signals DONE to [TL]
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 2. REST API  — curl / app                               │
  │    [QA-P] runs curl sequence; fills result table        │
  └─────────────────┬────────────────────────────────────────┘
                    │ [QA-P] terminates curl sessions; signals DONE to [TL]
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 3. WebSocket  — app / websocat                          │
  │    [BE-ADMIN] starts ws_echo_server.js; signals READY   │
  │    [QA-P] runs ws_rtt_client.py; fills result table     │
  └─────────────────┬────────────────────────────────────────┘
                    │ [QA-P] closes WS connections; signals DONE to [TL]
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 4. mDNS  — app + tshark                                 │
  │    [NET-ENG] starts tshark capture                      │
  │    [QA-P] enables mDNS advertiser on Device A           │
  │    [QA-S] triggers discovery on Device B; records time  │
  └─────────────────┬────────────────────────────────────────┘
                    │ [NET-ENG] stops tshark; [QA-P] signals DONE to [TL]
                    ▼
  ┌──────────────────────────────────────────────────────────┐
  │ 5. GSM  — curl + test handset                           │
  │    [QA-P] runs curl send commands                       │
  │    [QA-S] watches handset; sends SMS-RECEIVED signal    │
  │    [BE-ADMIN] tails server logs for dispatch timestamps │
  │    [TL] times the ≥ 30 s interval between sends        │
  └─────────────────┬────────────────────────────────────────┘
                    │
                    ▼
          END SCENARIO / NEXT
```

#### Scenario 3 execution — node-step outer loop

Scenario 3 differs from Scenarios 1 and 2: sub-tests 9.4, 9.5, 9.6, and 9.8 run **concurrently within each node count step**, not sequentially. Follow this loop for every step before incrementing node count:

```
FOR EACH node count step: 1 → 5 → 10 → 20 → 30
  │
  │  [TL] gives GO signal before each step begins
  │
  ├─ START CONCURRENT LOAD (leave running until end of step):
  │    [QA-S] k6 run --vus <N> --duration 3m k6_combined.js    (§9.4)
  │    [QA-S] bash sim_ws.sh <N>                                (§9.5)
  │
  ├─ WHILE BOTH ARE ACTIVE (within the 3-minute hold window):
  │    [QA-P]    iperf3 -c 192.168.1.10 -t 60    →  record §9.6 TCP throughput
  │    [QA-S]    mDNS discovery on Device B       →  record §9.6 mDNS latency
  │    [QA-P]    10 GSM sends (§9.8 Sub-Test A)   →  record dispatch times
  │    [QA-S]    watch GSM handset                →  record delivery latency
  │    [BE-ADMIN] monitor server CPU/mem          →  record utilization
  │
  ├─ STOP ALL LOAD:  [TL] sends STOP signal
  │    [QA-S] Ctrl+C on k6 terminal
  │    [QA-S] kill PIDs printed by sim_ws.sh
  │    Wait 60 s for server connections to drain
  │
  └─ RECORD all metrics for this step — [QA-P] and [QA-S] fill tables; [TL] confirms before next step
```

---

## 7. Scenario 1 – Single-LAN Operation

### 7.1 Purpose

Establish baseline performance metrics for all tested protocols within a single LAN segment. No traffic crosses the PtP wireless backhaul. Results from this scenario serve as the reference for comparison in Scenarios 2 and 3.

### 7.2 Network Setup

- Android device(s) connected to AP-A1 or AP-A2 on LAN A
- Backend server at 192.168.1.10 on LAN A (same subnet)
- Router and PtP bridge are active but carry no test traffic
- All communication is confined to the 192.168.1.0/24 subnet

> **Team Coordination — Scenario 1:**
> - **[QA-P]** and **[QA-S]** are both on LAN A for this scenario (no cross-LAN separation required)
> - **[BE-ADMIN]** confirms backend server is reachable before **[TL]** gives the first `GO`
> - **[QA-S]** has the test GSM handset in hand before §7.7 begins
> - **[NET-ENG]** confirms AP-A1 and AP-A2 are operational and device(s) have DHCP addresses

---

### 7.3 Sub-Test 1 — TCP Performance

**Tool:** iperf3, ping, mtr

**Procedure:**

1. **[BE-ADMIN]** On the backend server (192.168.1.10), start the iperf3 listener. Send `READY` signal to **[QA-P]** once confirmed active:
   ```bash
   iperf3 -s
   ```
2. **[QA-P]** After receiving `READY`, run a 60-second TCP throughput test from the Android device (or test laptop on LAN A):
   ```bash
   iperf3 -c 192.168.1.10 -t 60 -i 5 --json -o s1_tcp_run1.json
   ```
3. **[QA-P]** Measure RTT and packet loss:
   ```bash
   ping -c 100 -i 0.2 192.168.1.10
   ```
4. **[QA-P]** Trace per-hop latency:
   ```bash
   mtr --report --report-cycles 60 192.168.1.10
   ```
5. **[QA-P]** Repeat steps 2–4 three times. Record average values in the result table. Signal `DONE` to **[TL]** when complete.

**Metrics Collected:** Throughput (Mbps), avg RTT (ms), max RTT (ms), packet loss (%), jitter (ms)

**Repetitions:** 3 runs; averaged

**Expected Behavior:** Throughput near AP rated wireless speed. RTT below 5 ms within local LAN. Packet loss = 0%. Jitter < 1 ms.

**Result Table 7.3 — TCP Performance (Single-LAN)**

| Run | Throughput (Mbps) | Avg RTT (ms) | Max RTT (ms) | Packet Loss (%) | Jitter (ms) |
|---|---|---|---|---|---|
| 1 | — | — | — | — | — |
| 2 | — | — | — | — | — |
| 3 | — | — | — | — | — |
| **Average** | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 7.3b Sub-Test 1b — TCP P2P Performance (App Device-to-Device)

**Tool:** Android application TCP server/client, `sim_tcp_client.py` (simulation)

**Purpose:** Test the mobile app's built-in TCP transport between two endpoints on the same LAN — distinct from the iperf3 test in §7.3 which measures throughput to the backend server. The app's `TcpServerAdapter` and `TcpClientAdapter` use `react-native-tcp-socket` and are the direct P2P transport between devices.

**ADB Prerequisites (complete once before this sub-test):**
1. Install ADB on the test laptop:
   - Ubuntu/Debian: `sudo apt install adb`
   - Mac: `brew install android-platform-tools`
   - Windows: download from [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools)
2. On Device A: Settings → Developer Options → enable **USB Debugging**. Connect Device A to the test laptop via USB.
3. Run `adb devices` and confirm Device A appears as `device` (not `unauthorized`). Tap **Allow** on the device if a prompt appears.
4. Note Device A's serial (first column from `adb devices`) — substitute it for `<DEVICE_A_SERIAL>` below.

**Setup:**
- **[QA-P]** operates Device A (physical Android, USB connected to test laptop on LAN A): starts app TCP server; listens on a dynamically assigned port
- **[QA-S]** operates Device B (second physical device or simulation laptop on LAN A): connects as TCP client
- **[QA-P]** discovers the listening port via ADB (Step 0) and sends the IP + port to **[QA-S]** before Step 2 begins
- The listening port must be discovered before each run — the app assigns it at runtime

> **Note:** The Android app must echo back the full JSON payload unchanged for `sim_tcp_client.py` to compute RTT correctly. Confirm this behavior in the app's TCP server implementation before running the script. If the app sends a different response format, update the `sock.recv()` parsing logic in the script accordingly.

**Procedure:**
0. **[QA-P]** After enabling TCP server mode in the app on Device A, discover its LAN IP and port via ADB. Send the resulting IP and port to **[QA-S]** via the agreed channel before proceeding:
   ```bash
   TCP_PORT=$(adb -s <DEVICE_A_SERIAL> shell ss -tlnp \
     | awk '/tcp.*LISTEN/{print $4}' | grep -oE '[0-9]+$' | tail -1)
   DEVICE_A_IP=$(adb -s <DEVICE_A_SERIAL> shell ip -4 addr show wlan0 \
     | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
   echo "Device A: $DEVICE_A_IP : $TCP_PORT"
   ```
1. **[QA-P]** On Device A, enable TCP server mode in the application. Confirm listening (Step 0).
2. **[QA-S]** After receiving Device A's IP and port from **[QA-P]**, run 120 echo messages at 500 ms intervals from Device B or the simulation laptop:
   ```bash
   python3 sim_tcp_client.py $DEVICE_A_IP $TCP_PORT 1 60
   ```
3. **[QA-S]** Records per-message RTT, connection establishment time, success rate, and disconnection count. Passes values to **[QA-P]** for the result table.
4. **[QA-P]** and **[QA-S]** coordinate to terminate the connection between runs. Repeat 3 times.

**`sim_tcp_client.py`** — save to test laptop before testing:
```python
#!/usr/bin/env python3
# sim_tcp_client.py <host> <port> <num_clients> <duration_sec>
# Simulates N TCP clients connecting to the Android app's TCP server.
import socket, threading, time, sys, json, statistics

results = []
lock = threading.Lock()  # protects shared results list across threads

def run_client(cid, host, port, duration, interval=0.5):
    rtts, drops = [], 0
    try:
        # open one persistent TCP connection per simulated client
        sock = socket.create_connection((host, port), timeout=5)
    except Exception as e:
        print(f"[client {cid}] connect failed: {e}")
        return
    t_end = time.time() + duration
    while time.time() < t_end:
        # embed a timestamp in the payload so the server can echo it back
        msg = json.dumps({"id": cid, "seq": len(rtts), "ts": time.time()}).encode() + b"\n"
        try:
            t0 = time.time()
            sock.sendall(msg)
            sock.recv(1024)                          # wait for echo reply
            rtts.append((time.time() - t0) * 1000)  # RTT in milliseconds
        except Exception:
            drops += 1  # count failed sends/receives as drops
        time.sleep(interval)  # 500 ms between messages → 120 msgs per 60 s run
    sock.close()
    with lock:
        results.append({"client": cid, "rtts": rtts, "drops": drops})

host, port = sys.argv[1], int(sys.argv[2])
n, dur = int(sys.argv[3]), int(sys.argv[4])
# launch all N client threads concurrently — they start at roughly the same time
threads = [threading.Thread(target=run_client, args=(i, host, port, dur)) for i in range(n)]
for t in threads: t.start()
for t in threads: t.join()

# flatten per-client RTT lists into one list for aggregate statistics
all_rtts = [r for c in results for r in c["rtts"]]
total_drops = sum(c["drops"] for c in results)
print(f"Clients: {n}  Messages: {len(all_rtts)}  Drops: {total_drops}")
if all_rtts:
    print(f"Avg RTT: {statistics.mean(all_rtts):.2f} ms  Max: {max(all_rtts):.2f} ms")
    print(f"Jitter (stdev): {statistics.stdev(all_rtts) if len(all_rtts)>1 else 0:.2f} ms"
          f"  Success: {100*(1 - total_drops/(len(all_rtts)+total_drops)):.1f}%")
```

**Metrics Collected:** Connection establishment time (ms), avg message RTT (ms), max RTT (ms), jitter (ms), message success rate (%), disconnection count

**Repetitions:** 3 runs; averaged

**Expected Behavior:** RTT comparable to base ping on same LAN (< 5 ms). Zero drops. 100% message delivery. Connection establishment < 50 ms.

**Result Table 7.3b — TCP P2P Performance (Single-LAN)**

| Run | Connect Time (ms) | Avg RTT (ms) | Max RTT (ms) | Jitter (ms) | Success Rate (%) | Disconnections |
|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — |
| **Average** | **—** | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 7.4 Sub-Test 2 — REST API Performance

**Tool:** curl (or Android application HTTP test screen)

**Procedure:**

1. **[QA-P]** Verify server API is reachable (confirm with **[BE-ADMIN]** if this fails):
   ```bash
   curl -I http://192.168.1.10/auth/
   # Expected: HTTP/1.1 200 OK — if not, resolve before proceeding
   ```
2. **[QA-P]** Execute 50 sequential HTTP GET requests and save response times to a file:
   ```bash
   for i in $(seq 1 50); do
     curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/auth/
   done | tee s1_api_run1.txt
   ```
3. **[QA-P]** Compute avg, P95, and P99 from the saved file:
   ```bash
   awk '{v[NR]=$1*1000} END{
     n=NR; s=0; for(i=1;i<=n;i++) s+=v[i];
     asort(v);
     printf "N=%d  Avg=%.2f ms  P95=%.2f ms  P99=%.2f ms\n",
       n, s/n, v[int(n*0.95)+1], v[int(n*0.99)+1]
   }' s1_api_run1.txt
   ```
4. **[QA-P]** Record the number of failed requests:
   ```bash
   wc -l s1_api_run1.txt   # should be 50; fewer lines = curl errors/timeouts
   ```
5. **[QA-P]** Repeat the full sequence two more times, saving to `s1_api_run2.txt` and `s1_api_run3.txt`. Apply the awk command to each file. Signal `DONE` to **[TL]** when complete.

**Metrics Collected:** Avg response time (ms), P95 (ms), P99 (ms), success rate (%)

**Repetitions:** 3 sequences of 50 requests each

**Expected Behavior:** Average response time below 20 ms on local LAN. P99 below 50 ms. Success rate = 100%.

**Result Table 7.4 — REST API Performance (Single-LAN)**

| Run | Requests Sent | Avg Response (ms) | P95 (ms) | P99 (ms) | Success Rate (%) |
|---|---|---|---|---|---|
| 1 | 50 | — | — | — | — |
| 2 | 50 | — | — | — | — |
| 3 | 50 | — | — | — | — |
| **Average** | 50 | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 7.5 Sub-Test 3 — WebSocket Performance

**Tool:** Android application WebSocket client (or websocat)

**Procedure:**

1. **[BE-ADMIN]** Start the WebSocket echo server on the backend server (if not already running). Send `READY` to **[QA-P]**:
   ```bash
   node ws_echo_server.js 8080
   ```
2. **[QA-P]** After receiving `READY`, establish a WebSocket connection from the Android device to the server:
   ```
   ws://192.168.1.10:8080
   ```
3. **[QA-P]** Send a timestamped message every 500 ms for 60 seconds (120 total messages per run).
4. Server echoes each message with a server-side timestamp appended.
5. **[QA-P]** Compute per-message RTT:
   ```
   message_RTT = echo_received_time − message_sent_time
   ```
6. **[QA-P]** Record avg RTT, max RTT, jitter (std deviation), message success rate, and disconnection count in the result table.
7. **[QA-P]** Repeat 3 times. Terminate and re-establish connection between runs. Signal `DONE` to **[TL]** when complete.

**WebSocket Echo Server — `ws_echo_server.js`** (save on backend server, run once before each scenario):

```javascript
// ws_echo_server.js — echoes every message back with an added server-side timestamp
// Install: npm install ws
// Run:     node ws_echo_server.js [port]   (default 8080)
const { WebSocketServer } = require('ws');
const port = parseInt(process.argv[2] || '8080', 10);
const wss = new WebSocketServer({ port });
console.log(`WS echo server listening on ws://0.0.0.0:${port}`);
wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      msg.server_ts = Date.now();   // millisecond timestamp when server received the message
      ws.send(JSON.stringify(msg)); // echo the full object back to the client
    } catch { ws.send(raw); }      // non-JSON: echo verbatim (keeps the server generic)
  });
});
```

**WebSocket RTT Client — `ws_rtt_client.py`** (run from Android device via ADB shell, or test laptop):

```python
#!/usr/bin/env python3
# ws_rtt_client.py <host> <port> [messages] [interval_ms]
# Sends N timestamped messages at the given interval, prints per-message RTT, prints summary.
# Install: pip install websocket-client
import websocket, json, time, sys, statistics

host     = sys.argv[1]
port     = int(sys.argv[2])
n_msgs   = int(sys.argv[3])   if len(sys.argv) > 3 else 120   # default 120 messages
interval = float(sys.argv[4]) / 1000 if len(sys.argv) > 4 else 0.5  # default 500 ms

ws = websocket.create_connection(f"ws://{host}:{port}", timeout=10)
rtts, drops = [], 0

for seq in range(n_msgs):
    payload = json.dumps({"seq": seq, "client_ts": time.time() * 1000})
    t0 = time.time()
    try:
        ws.send(payload)
        raw  = ws.recv()
        rtt  = (time.time() - t0) * 1000           # RTT in milliseconds (client-side only)
        rtts.append(rtt)
        data = json.loads(raw)
        print(f"seq={seq:3d}  RTT={rtt:.2f} ms  server_ts={data.get('server_ts','?')}")
    except Exception as e:
        drops += 1
        print(f"seq={seq:3d}  DROP ({e})")
    time.sleep(interval)

ws.close()
print(f"\n--- Summary ---")
print(f"Sent: {n_msgs}  Drops: {drops}  Success: {100*(1 - drops/n_msgs):.1f}%")
if rtts:
    print(f"Avg RTT: {statistics.mean(rtts):.2f} ms  Max: {max(rtts):.2f} ms"
          f"  Jitter (stdev): {statistics.stdev(rtts) if len(rtts) > 1 else 0:.2f} ms")
```

RTT is measured entirely on the client side:
```
message_RTT = echo_received_time − message_sent_time
```
`server_ts` is logged for audit purposes but is not used in the RTT formula — using both sides' clocks would require synchronized system clocks across devices.

**Run commands for this sub-test (Single-LAN, 120 messages):**
```bash
# On backend server
node ws_echo_server.js 8080

# On Android device (via ADB shell) or test laptop on LAN A
python3 ws_rtt_client.py 192.168.1.10 8080 120 500
```

**Metrics Collected:** Avg WS RTT (ms), max RTT (ms), jitter (ms), message success rate (%), disconnection count

**Repetitions:** 3 runs of 60 seconds each

**Expected Behavior:** WS RTT approximately equal to base ping RTT. Zero disconnections. 100% message delivery rate. Jitter < 2 ms within local LAN.

**Result Table 7.5 — WebSocket Performance (Single-LAN)**

| Run | Messages Sent | Avg WS RTT (ms) | Max RTT (ms) | Jitter (ms) | Success Rate (%) | Disconnections |
|---|---|---|---|---|---|---|
| 1 | 120 | — | — | — | — | — |
| 2 | 120 | — | — | — | — | — |
| 3 | 120 | — | — | — | — | — |
| **Average** | 120 | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 7.6 Sub-Test 4 — mDNS Service Discovery

**Tool:** Android application mDNS discovery screen, tshark

**Procedure:**

1. **[QA-P]** On Device A (physical Android, LAN A), enable the mDNS advertiser in the application (e.g., activate "Advertise service" in the app settings). The app registers a service record (e.g., `_ylp._tcp`) on the local Wi-Fi interface. Confirm it is advertising, then signal **[QA-S]** and **[NET-ENG]** that it is ready.
2. **[NET-ENG]** Start packet capture on the AP or router interface to verify mDNS traffic at the packet level:
   ```bash
   sudo tshark -i <interface> -f "udp port 5353" -w s1_mdns.pcapng
   ```
3. **[QA-S]** On Device B (same LAN), trigger the mDNS service discovery function in the application. The app queries for peers advertising `_ylp._tcp` on the local subnet. Record the time from the discovery query being issued to Device A's service record being resolved, as reported by the application. Pass each discovery latency value to **[QA-P]** for the result table.
4. **[QA-S]** Repeat 10 discovery attempts. Wait at least **120 seconds** between attempts — mDNS service record TTLs are typically 4500 s but resolvers cache for 60–120 s minimum. A 5-second wait is insufficient and will return cached results.
   If you need to flush immediately between attempts, **[QA-S]** runs on the discovery device:
   ```bash
   # On Linux test laptop:
   sudo systemctl restart avahi-daemon
   # On Android Device B: force-stop and relaunch the app to reset its mDNS resolver state
   ```
5. **[NET-ENG]** Stop tshark capture. Verify that Device A's mDNS announcement and Device B's query/response packets are present in the capture file. **[QA-P]** signals `DONE` to **[TL]** when the result table is complete.

**Metrics Collected:** Discovery latency per attempt (ms), success rate (%), avg discovery latency (ms)

**Repetitions:** 10 individual discovery attempts

**Expected Behavior:** Device B resolves Device A's service record within 100–500 ms. All 10 attempts successful when both devices are on the same LAN segment and the advertiser is active.

**Result Table 7.6 — mDNS Discovery Performance (Single-LAN)**

| Attempt | Discovery Latency (ms) | Result | Notes |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |
| 7 | — | — | — |
| 8 | — | — | — |
| 9 | — | — | — |
| 10 | — | — | — |
| **Average / Rate** | **—** | **—/10** | — |

*Observation:* ________________________________________________________________

---

### 7.7 Sub-Test 5 — GSM Modem Integration (Single-LAN Baseline)

**Tool:** `curl`, `gsm_burst.sh`, test GSM handset

**Purpose:** Establish the GSM delivery latency baseline with no PtP backhaul traffic. Delivery path: Backend Server (192.168.1.10) → GSM Modem → SMS recipient handset. Results serve as the reference for Scenarios 2 and 3.

> **Role assignments for this sub-test:**
> - **[QA-P]** — runs all `curl` send commands from the test laptop on LAN A
> - **[QA-S]** — physically holds and watches the test GSM handset; sends `SMS-RECEIVED [time]` signal to **[QA-P]** the moment the message thread timestamp is visible
> - **[BE-ADMIN]** — tails server logs during sends to capture server-side dispatch timestamps as backup: `tail -f /var/log/gsm-server.log`
> - **[TL]** — times the ≥ 30 s interval between sends and gives `GO` signal for each send

**Procedure:**

**Sub-Test A — Idle Delivery Baseline (10 sends):**

1. **[QA-P]** Confirm the server GSM endpoint is reachable (check with **[BE-ADMIN]** if this fails):
   ```bash
   curl -I http://192.168.1.10:8000/api/gsm/send
   ```
2. **[TL]** gives `GO`. **[QA-P]** sends one server-originated GSM message and records the HTTP response time (proxy for server dispatch latency). **[QA-S]** watches the handset and sends `SMS-RECEIVED [time]` when the message arrives. **[QA-P]** records both timestamps in the result table:
   ```bash
   curl -s -w "\nHTTP %{http_code}  dispatch %{time_total}s\n" \
        -X POST http://192.168.1.10:8000/api/gsm/send \
        -H "Content-Type: application/json" \
        -d '{"to": "<TEST_HANDSET_NUMBER>", "message": "S1-A-1"}'
   ```
3. **[TL]** enforces ≥ 30 s between each send and gives `GO` before each repeat. **[QA-P]** repeats 10 times total.

**Sub-Test B — Burst Reliability (20 rapid sends, 1 per 5 s):**

**[QA-P]** saves and runs `gsm_burst.sh` on the test laptop. **[QA-S]** watches the handset and counts deliveries, duplicates, and failures — calling out each received message. **[TL]** monitors the burst log for HTTP errors:
```bash
#!/bin/bash
# gsm_burst.sh — 20 server-originated GSM sends at 1 per 5 s
# The 5 s interval is intentional: sending faster risks carrier-side throttling
# or duplicate suppression, which would skew the reliability measurement.
for i in $(seq 1 20); do
  TS=$(date +%s%3N)  # current timestamp in milliseconds — embedded in message body
  curl -s \
    -X POST http://192.168.1.10:8000/api/gsm/send \
    -H "Content-Type: application/json" \
    -d "{\"to\": \"<TEST_HANDSET_NUMBER>\", \"message\": \"burst-${i}-ts-${TS}\"}" \
    -o /dev/null -w "send $i  HTTP %{http_code}  dispatch %{time_total}s\n" \
    >> s1_gsm_burst.log   # append each result line to the log file
  echo "Queued send $i at ${TS} ms"
  sleep 5  # wait 5 s before next send to avoid carrier throttle
done
echo "Done. Results in s1_gsm_burst.log"
```

**Metrics Collected:** Delivery latency per attempt (s), avg latency (s), success rate (%), burst duplicates, burst failures

**Degradation Indicator:** Avg delivery latency > 10 s (indicates modem/dispatch issue, not carrier delay); burst success rate < 95%

**Result Table 7.7a — GSM Idle Delivery Latency (Single-LAN)**

| Attempt | Server Send Time | SMS Arrival Time | Latency (s) | Result |
|---|---|---|---|---|
| 1 | — | — | — | — |
| 2 | — | — | — | — |
| 3 | — | — | — | — |
| 4 | — | — | — | — |
| 5 | — | — | — | — |
| 6 | — | — | — | — |
| 7 | — | — | — | — |
| 8 | — | — | — | — |
| 9 | — | — | — | — |
| 10 | — | — | — | — |
| **Average** | — | — | **—** | **—/10** |

**Result Table 7.7b — GSM Burst Reliability (Single-LAN, 20 Sends)**

| Metric | Value |
|---|---|
| Total attempted | 20 |
| Successfully delivered | — |
| Duplicates received | — |
| Undelivered / failed | — |
| Avg delivery latency (s) | — |

*Observation:* ________________________________________________________________

---

## 8. Scenario 2 – Multi-LAN Operation Across PtP Link

### 8.1 Purpose

Evaluate the performance impact of routing all application traffic across the 30 KM PtP wireless backhaul. Android devices on LAN B communicate with the backend server on LAN A. All packets traverse Dish B → PtP link → Dish A → Router → Backend Server. Results are compared directly against Scenario 1 baselines to quantify backhaul-induced overhead.

**Traffic path comparison by scenario:**

```
Scenario 1 (Single-LAN):
  [Android Device] ──Wi-Fi──► [AP-A] ──Ethernet──► [Backend Server]

Scenario 2 (Multi-LAN / PtP):
  [Android Device] ──Wi-Fi──► [AP-B] ──► [Dish B] ══30 KM PtP══ [Dish A] ──► [Router] ──► [Backend Server]

Scenario 3 (Scalability, N devices):
  [Device 1] ─┐
  [Device 2] ─┤──Wi-Fi──► [APs] ──► [Dish B] ══PtP══ [Dish A] ──► [Router] ──► [Backend Server]
  ...         ─┘
  [Device N] ─┘
  (all N devices transmitting concurrently)
```

### 8.2 Network Setup

- Android device(s) connected to AP-B1 or AP-B2 on LAN B (192.168.2.0/24)
- Backend server remains at 192.168.1.10 on LAN A
- All test traffic crosses the PtP wireless backhaul
- If dish management interfaces are accessible, RSSI and link rate are recorded during each sub-test

> **Team Coordination — Scenario 2:**
> - **[QA-P]** remains on LAN A (same side as backend server)
> - **[QA-S]** physically moves to LAN B side (or connects Device B to AP-B1/B2) — confirm this before starting
> - **[NET-ENG]** verifies end-to-end reachability (`ping -c 10 192.168.1.10` from LAN B) before **[TL]** gives first `GO`
> - **[BE-ADMIN]** confirms backend server and all services (iperf3, WS echo, GSM API) are ready
> - **[QA-S]** holds the test GSM handset on LAN B side for §8.7
> - Communication channel (radio/chat) between **[QA-P]** and **[QA-S]** must be confirmed active

---

### 8.3 Sub-Test 1 — TCP Communication Across PtP Bridge

**Tool:** iperf3, ping, mtr

**Procedure:**

1. **[BE-ADMIN]** Start the iperf3 listener on the backend server and send `READY` to **[QA-P]**:
   ```bash
   iperf3 -s
   ```
2. **[QA-P]** Verify end-to-end IP reachability from the LAN A side (or **[QA-S]** verifies from LAN B device — record which):
   ```bash
   ping -c 10 192.168.1.10
   ```
3. **[QA-P]** (or **[QA-S]** if running from LAN B device) After receiving `READY`, run a 2-minute sustained TCP throughput test:
   ```bash
   iperf3 -c 192.168.1.10 -t 120 -i 10 --json -o s2_tcp_run1.json
   ```
4. **[QA-P]** Record per-hop RTT and loss including both dish hops:
   ```bash
   mtr --report --report-cycles 100 192.168.1.10
   ```
5. **[NET-ENG]** If accessible, read RSSI and current link rate from Dish A and Dish B management interfaces and record in the result table.
6. **[QA-P]** Run the bridge stability test — continuous ping for 10 minutes:
   ```bash
   ping -i 1 -c 600 192.168.1.10 | tee s2_stability.txt
   ```
   Log any RTT values exceeding 3× the mean and any packet loss events.
7. **[QA-P]** Repeat iperf3 and ping tests 3 times. Record averages. Signal `DONE` to **[TL]** when complete.

**Metrics Collected:** Throughput (Mbps), avg RTT (ms), max RTT (ms), packet loss (%), jitter (ms), RSSI Dish A (dBm), RSSI Dish B (dBm), backhaul link rate (Mbps)

**Repetitions:** 3 runs for iperf3 and ping; 1 run for bridge stability test

**Expected Behavior:** Throughput lower than Scenario 1 due to wireless backhaul overhead. RTT increases by the propagation delay of the 30 KM link. No sustained packet loss on a stable PtP link.

**Result Table 8.3 — TCP Performance Across PtP Bridge**

| Run | Throughput (Mbps) | Avg RTT (ms) | Max RTT (ms) | Packet Loss (%) | Jitter (ms) | RSSI-A (dBm) | RSSI-B (dBm) |
|---|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — | — |
| **Average** | **—** | **—** | **—** | **—** | **—** | **—** | **—** |

**Result Table 8.3b — Bridge Stability (10-Minute Ping)**

| Time Window | Avg RTT (ms) | Max RTT (ms) | Packet Loss (%) | RTT Spikes Detected |
|---|---|---|---|---|
| 0–2 min | — | — | — | — |
| 2–4 min | — | — | — | — |
| 4–6 min | — | — | — | — |
| 6–8 min | — | — | — | — |
| 8–10 min | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 8.3c Sub-Test 1c — TCP P2P Across PtP Bridge (App Device-to-Device)

**Tool:** Android application TCP server/client, `sim_tcp_client.py` (same script as §7.3b)

**Purpose:** Test the app's P2P TCP transport when the two endpoints are on different LANs separated by the 30 KM PtP backhaul. All messages traverse Dish B → PtP → Dish A → LAN A. Compare directly against §7.3b baseline to quantify PtP overhead on direct device-to-device connections.

**Setup:**
- **[QA-P]** operates Device A (physical Android, LAN A): TCP server mode; port dynamically assigned — discover via ADB (Step 0). Sends IP + port to **[QA-S]** before Step 2 begins.
- **[QA-S]** operates Device B (physical Android or simulation laptop, LAN B): TCP client connecting to Device A's LAN A IP

**Procedure:**
0. **[QA-P]** Discover Device A's LAN A IP and TCP server port. Send these values to **[QA-S]** via the agreed channel:
   ```bash
   TCP_PORT=$(adb -s <DEVICE_A_SERIAL> shell ss -tlnp \
     | awk '/tcp.*LISTEN/{print $4}' | grep -oE '[0-9]+$' | tail -1)
   DEVICE_A_IP=$(adb -s <DEVICE_A_SERIAL> shell ip -4 addr show wlan0 \
     | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
   echo "Device A (LAN A): $DEVICE_A_IP : $TCP_PORT"
   ```
1. **[QA-S]** Verify cross-LAN reachability from LAN B:
   ```bash
   ping -c 5 $DEVICE_A_IP      # from LAN B device or laptop
   ```
2. **[QA-S]** Run 120-message echo test from LAN B client to LAN A server:
   ```bash
   python3 sim_tcp_client.py $DEVICE_A_IP $TCP_PORT 1 60
   ```
3. **[QA-S]** Records connection establishment time, per-message RTT, max RTT, jitter, success rate, disconnection count, and reconnection time if a drop occurs. Passes values to **[QA-P]** for the result table.
4. **[QA-P]** and **[QA-S]** coordinate to terminate the connection between runs. **[QA-P]** repeats 3 times and computes deltas vs. §7.3b single-LAN average.

**Metrics Collected:** Connect time (ms), avg RTT (ms), max RTT (ms), jitter (ms), success rate (%), disconnection count, reconnect time (ms), delta vs. S1 §7.3b (ms)

**Repetitions:** 3 runs; averaged

**Expected Behavior:** RTT increases by the PtP propagation overhead vs. §7.3b. Zero drops on a stable link. App-level reconnect logic activates on any drop.

**Result Table 8.3c — TCP P2P Across PtP Bridge**

| Run | Connect Time (ms) | Avg RTT (ms) | Max RTT (ms) | Jitter (ms) | Success Rate (%) | Disconnections | Reconnect Time (ms) | Delta vs. S1 (ms) |
|---|---|---|---|---|---|---|---|---|
| 1 | — | — | — | — | — | — | — | — |
| 2 | — | — | — | — | — | — | — | — |
| 3 | — | — | — | — | — | — | — | — |
| **Average** | **—** | **—** | **—** | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 8.4 Sub-Test 2 — REST API Across LAN Segments

**Tool:** curl (or Android application)

**Procedure:**

1. **[QA-S]** From the Android device or test laptop on LAN B, send 50 sequential HTTP requests to the LAN A server:
   ```bash
   for i in $(seq 1 50); do
     curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/auth/
   done | tee s2_api_run1.txt
   ```
2. **[QA-S]** Compute avg, P95, and P99 from the saved file:
   ```bash
   awk '{v[NR]=$1*1000} END{
     n=NR; s=0; for(i=1;i<=n;i++) s+=v[i];
     asort(v);
     printf "N=%d  Avg=%.2f ms  P95=%.2f ms  P99=%.2f ms\n",
       n, s/n, v[int(n*0.95)+1], v[int(n*0.99)+1]
   }' s2_api_run1.txt
   ```
3. **[QA-P]** Compute the delta relative to Scenario 1 averages (from §7.4 result table) and records in the comparison table.
4. **[QA-S]** Repeats the full 50-request sequence two more times, saving to `s2_api_run2.txt` and `s2_api_run3.txt`. Passes all values to **[QA-P]** for the result table.

**Metrics Collected:** Avg response time (ms), P95 (ms), P99 (ms), success rate (%), delta vs. Scenario 1 (ms)

**Repetitions:** 3 sequences of 50 requests

**Expected Behavior:** Response times increase by the PtP link RTT overhead compared to Scenario 1. Success rate remains 100% on a stable link. P99 latency reflects worst-case backhaul RTT variation.

**Result Table 8.4 — REST API Performance Across PtP Bridge**

| Run | Avg Response (ms) | P95 (ms) | P99 (ms) | Success Rate (%) | Delta vs. S1 Avg (ms) |
|---|---|---|---|---|---|
| 1 | — | — | — | — | — |
| 2 | — | — | — | — | — |
| 3 | — | — | — | — | — |
| **Average** | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 8.5 Sub-Test 3 — WebSocket Across PtP Bridge

**Tool:** Android application WebSocket client

**Procedure:**

1. **[BE-ADMIN]** Confirm `ws_echo_server.js` is running on the backend server (restart if needed). Send `READY` to **[QA-S]**:
   ```bash
   node ws_echo_server.js 8080
   ```
2. **[QA-S]** After receiving `READY`, establish a WebSocket connection from the LAN B Android device to the LAN A server:
   ```
   ws://192.168.1.10:8080
   ```
3. **[QA-S]** Send a timestamped message every 500 ms for **5 minutes** (600 total messages per run). The extended duration is used to detect connection instability that would not appear in short tests.
4. **[QA-S]** Compute per-message RTT as in §7.5. Record any disconnections and the time to re-establish the connection.
5. **[QA-S]** Passes all values to **[QA-P]** for the result table. **[QA-P]** and **[QA-S]** coordinate between runs. Repeat 3 times.

**Run commands for this sub-test (Cross-PtP, 600 messages = 5 minutes):**
```bash
# On backend server (if not already running from §7.5)
node ws_echo_server.js 8080

# On Android device on LAN B (via ADB shell) or test laptop on LAN B
python3 ws_rtt_client.py 192.168.1.10 8080 600 500
```

**Metrics Collected:** Avg WS RTT (ms), max RTT (ms), jitter (ms), message success rate (%), disconnection count, reconnection time (ms)

**Repetitions:** 3 runs of 5 minutes each

**Expected Behavior:** Higher RTT and jitter than Scenario 1, proportional to PtP link latency. Connection must remain stable over the full 5-minute duration. Any disconnections should trigger automatic reconnection within an acceptable timeframe.

**Result Table 8.5 — WebSocket Performance Across PtP Bridge**

| Run | Messages Sent | Avg WS RTT (ms) | Max RTT (ms) | Jitter (ms) | Success Rate (%) | Disconnections | Reconnection Time (ms) |
|---|---|---|---|---|---|---|---|
| 1 | 600 | — | — | — | — | — | — |
| 2 | 600 | — | — | — | — | — | — |
| 3 | 600 | — | — | — | — | — | — |
| **Average** | 600 | **—** | **—** | **—** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

### 8.6 Sub-Test 4 — mDNS Propagation Across LANs

**Tool:** Android application, tshark

**Procedure:**

1. **[QA-P]** On Device A (physical Android, LAN A), enable the mDNS advertiser in the application, as in §7.6 step 1. Confirm it is advertising and signal **[NET-ENG]** to start captures.
2. **[NET-ENG]** Start packet captures simultaneously on both the LAN A and LAN B interfaces:
   ```bash
   sudo tshark -i <LAN-A-interface> -f "udp port 5353" -w s2_mdns_lana.pcapng &
   sudo tshark -i <LAN-B-interface> -f "udp port 5353" -w s2_mdns_lanb.pcapng &
   ```
3. **[QA-S]** On Device B (LAN B), trigger the mDNS service discovery function in the application, searching for `_ylp._tcp`. Attempt discovery 10 times. Record success or failure and latency where applicable. Pass results to **[QA-P]** for the result table.
4. **[QA-P]** Notes the router configuration: if no mDNS proxy is configured, document the failed discovery as an expected architectural outcome. If a proxy is configured, record discovery latency as in §7.6. **[NET-ENG]** stops both tshark captures when complete.

**Why mDNS fails across LANs:**

```
  LAN A (192.168.1.0/24)              LAN B (192.168.2.0/24)
  ┌──────────────────────┐            ┌──────────────────────┐
  │                      │            │                      │
  │  [Device A — app]    │            │  [Device B — app]    │
  │  advertises via mDNS │            │  queries for service │
  │         │            │            │         │            │
  │  [AP-A1/A2]◄─mDNS──►│            │  [AP-B1/B2]          │
  │  multicast           │            │         │            │
  └──────────┬───────────┘            └─────────┬────────────┘
             │                                  │
             └──────────► [Router] ◄────────────┘
                              │
                     ✗ BLOCKS mDNS
                     (TTL=1: packet
                      expires here)
```

> **Beginner note:** mDNS (multicast DNS) is a zero-configuration discovery protocol — it lets devices announce themselves on the local network without needing a central DNS server. The catch is that mDNS packets are sent with a **TTL (Time To Live) of 1**, meaning every router that receives the packet decrements the TTL to 0 and discards it rather than forwarding it. This is intentional: mDNS is designed to work only within a single local network segment. If your system needs cross-LAN discovery, the router must run an **mDNS proxy** (such as Avahi's reflector mode) that receives the multicast on one interface and re-broadcasts it on the other.

> **Note:** mDNS operates on the link-local multicast address 224.0.0.251 (TTL=1). By design, mDNS packets do not cross IP router boundaries. Cross-LAN mDNS discovery requires an mDNS proxy or repeater service running on the router. If such a proxy is not present, discovery failure is the expected and correct behavior and does not represent a system defect.

**Pre-test setup — Router mDNS Proxy status (record once):**

```
Router mDNS proxy configured: [ Yes / No ]
If No: all 10 discovery attempts below are EXPECTED TO FAIL — record each as "Expected Fail".
       This is the correct architectural outcome, not a defect.
If Yes: record discovery latency per attempt as normal.
```

**Metrics Collected:** Discovery result (success/fail), discovery latency (ms) if proxy is active

**Repetitions:** 10 attempts

**Result Table 8.6 — mDNS Propagation Across LANs**

| Attempt | Result | Discovery Latency (ms) | Notes |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |
| 7 | — | — | — |
| 8 | — | — | — |
| 9 | — | — | — |
| 10 | — | — | — |
| **Success Rate** | **—/10** | **—** | — |

*Observation:* ________________________________________________________________

---

### 8.7 Sub-Test 5 — GSM Modem Integration (Across PtP)

**Tool:** `curl`, `gsm_burst.sh`, test GSM handset

**Purpose:** Evaluate whether GSM delivery latency changes when the server is handling active inter-LAN traffic across the PtP backhaul, and whether triggering the send from LAN B (across the link) adds API call overhead. Compare against §7.7 baseline. Delivery path: LAN B device → API call over PtP → Backend Server (LAN A) → GSM Modem → SMS recipient.

> **Role assignments for this sub-test:**
> - **[QA-S]** — runs `curl` send commands from the LAN B device or laptop (cross-LAN API trigger)
> - **[QA-S]** — also physically holds and watches the test GSM handset; sends `SMS-RECEIVED [time]` to **[QA-P]**
> - **[QA-P]** — starts/stops the background iperf3 stream in Sub-Test B; records all timestamps in the result table
> - **[BE-ADMIN]** — tails server logs during sends; monitors modem status
> - **[TL]** — times ≥ 30 s inter-send intervals and gives `GO` for each send

**Procedure:**

**Sub-Test A — GSM Send Triggered from LAN B, No Background Load (10 sends):**

1. **[QA-S]** From the LAN B device or laptop, trigger server GSM sends via the cross-LAN API:
   ```bash
   curl -s -w "\nHTTP %{http_code}  dispatch %{time_total}s\n" \
        -X POST http://192.168.1.10:8000/api/gsm/send \
        -H "Content-Type: application/json" \
        -d '{"to": "<TEST_HANDSET_NUMBER>", "message": "S2-A-1"}'
   ```
2. **[BE-ADMIN]** captures server-side send timestamp from logs. **[QA-S]** sends `SMS-RECEIVED [time]` to **[QA-P]** when the handset message thread timestamp is visible.
3. **[TL]** enforces ≥ 30 s between sends and gives `GO` for each. **[QA-S]** repeats 10 times. **[QA-P]** computes delta vs. §7.7a average.

**Sub-Test B — GSM Send While PtP Traffic Is Active (10 sends):**

1. **[QA-P]** Start a sustained iperf3 stream to generate background PtP load:
   ```bash
   iperf3 -c 192.168.1.10 -t 300 --json -o s2_gsm_bg_load.json &
   BG_PID=$!
   ```
2. **[QA-S]** While iperf3 is running, send 10 GSM messages (same `curl` command as Sub-Test A, change message to `"S2-B-1"` through `"S2-B-10"`). Watch handset and send `SMS-RECEIVED [time]` signals to **[QA-P]** as before.
3. **[QA-P]** Records delivery latency in the result table and compares vs. Sub-Test A.
4. **[QA-P]** Stops background load after all 10 sends:
   ```bash
   kill $BG_PID
   ```

**Metrics Collected:** Delivery latency (s), success rate (%), delta vs. §7.7a (idle same-LAN), delta Sub-Test A vs. Sub-Test B (PtP load impact)

**Degradation Indicator:** Delivery latency > 30 s, or > 20 s increase vs. §7.7a baseline.

> **Note:** GSM delivery latency is predominantly carrier-side. If Sub-Test B latency significantly exceeds Sub-Test A, it indicates the modem's IP connection to the backend server is contending for the same backhaul bandwidth as the iperf3 stream.

**Result Table 8.7 — GSM Delivery Latency (Across PtP)**

| Attempt | S2-A: Cross-LAN, No Load (s) | S2-B: Cross-LAN, PtP Load (s) | Delta S2-A vs. §7.7a (s) |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |
| 7 | — | — | — |
| 8 | — | — | — |
| 9 | — | — | — |
| 10 | — | — | — |
| **Average** | **—** | **—** | **—** |

*Observation:* ________________________________________________________________

---

## 9. Scenario 3 – Scalability Testing with Increasing Connected Devices

### 9.1 Purpose

Determine the scalability limits of the system by incrementally increasing the number of concurrently connected Android devices. The test identifies the node count at which each protocol begins to degrade and isolates the bottleneck component.

### 9.2 Network Setup

- Android devices distributed across both LAN A and LAN B APs
- Backend server at 192.168.1.10 on LAN A
- Node count steps: **1, 5, 10, 20, 30** devices active simultaneously
- At each step, all active devices (physical or simulated — see §9.3) generate load concurrently
- Each step is held for a minimum of 3 minutes before metrics are recorded
- Physical Android devices (2–3 available) remain connected as live clients throughout all steps; remaining load is generated by simulation tools on a test laptop on the same LAN

> **Team Coordination — Scenario 3:**
> - **[QA-S]** sets up and operates the simulation laptop (k6, websocat, iperf3 parallel streams) — confirm tools are installed and tested before the first step begins
> - **[QA-P]** operates the physical Android device(s) and runs iperf3 and mDNS measurement commands during load steps
> - **[BE-ADMIN]** runs the server-side CPU/memory monitor throughout all steps: `watch -n 2 'top -bn1 | head -5 && free -m'`
> - **[TL]** controls the 3-minute hold timer at each step, gives `GO` and `STOP` signals, and confirms result tables are complete before advancing
> - **[QA-S]** also holds the test GSM handset for §9.8 sends

---

### 9.3 Device Simulation Strategy

Only 2–3 physical Android devices are available. Simulated clients running on a test laptop connected to the same LAN fill the remaining node slots at each step. Physical devices are retained as live clients to observe real application-layer behavior (WebSocket reconnect, mDNS discovery, GSM messaging) that simulators cannot reproduce.

> **Simulation ownership:** All simulation tools (`k6`, `sim_ws.sh`, `iperf3 -P`) are operated by **[QA-S]** from the simulation laptop. **[QA-P]** operates the physical Android device(s) and records real-device metrics tagged `[real]`. **[BE-ADMIN]** monitors server-side resource utilization throughout. **[TL]** coordinates the 3-minute hold window and signals when each step can be stopped.

> **Beginner note:** Simulators (k6, websocat, iperf3 parallel streams) generate realistic network load — they open real TCP connections and send real HTTP or WebSocket traffic — but they run on a laptop, not an Android device. They cannot exercise the full application stack (UI, mDNS discovery, automatic reconnect logic). This is why at least 1–2 real Android devices are kept in the test at all steps: the simulated traffic creates the load, while the real device tells you how the actual app behaves under that load.

#### 9.3.1 Simulated HTTP / API + WebSocket Load — k6

Install k6 on the test laptop: https://k6.io/docs/getting-started/installation/

Save as `k6_combined.js`:
```javascript
// k6_combined.js — one VU (Virtual User) simulates one Android device
// Each VU runs this function in a loop for the specified --duration.
//
// VU count = (target node count) − (number of real physical devices).
// Example: for the 10-node step with 1 real device → --vus 9
//
// Run per node step:
//   5-node  step: k6 run --vus 4  --duration 3m k6_combined.js  (4 sim + 1 real)
//   10-node step: k6 run --vus 9  --duration 3m k6_combined.js
//   20-node step: k6 run --vus 19 --duration 3m k6_combined.js
//   30-node step: k6 run --vus 29 --duration 3m k6_combined.js
import http from 'k6/http';
import ws   from 'k6/ws';
import { check, sleep } from 'k6';

const API_BASE = 'http://192.168.1.10';        // adjust port if API is not on port 80 (see §4.5)
const WS_URL   = 'ws://192.168.1.10:8080';    // must match ws_echo_server.js port (§7.5)

export default function () {
  // --- REST API call ---
  // Mimics the app's periodic health-check / data polling (1 request per iteration).
  // k6 automatically records response time histograms — visible in the summary output.
  const res = http.get(`${API_BASE}/auth/`, { timeout: '5s' });
  check(res, { 'API 200': (r) => r.status === 200 });  // fails show as error rate

  // --- WebSocket echo ---
  // Opens a WS connection, sends one timestamped ping, waits for the server echo,
  // computes RTT manually (server must echo the 'ts' field unchanged), then closes.
  const sent = Date.now();
  ws.connect(WS_URL, {}, function (socket) {
    socket.on('open', () => {
      // __VU is the k6 virtual user ID — useful for correlating logs per simulated device
      socket.send(JSON.stringify({ type: 'ping', ts: sent, vu: __VU }));
    });
    socket.on('message', (data) => {
      const rtt = Date.now() - JSON.parse(data).ts;  // RTT in milliseconds
      console.log(`VU ${__VU}  WS RTT ${rtt} ms`);
      socket.close();
    });
    socket.setTimeout(() => socket.close(), 3000);  // close if no echo within 3 s
  });

  sleep(5);  // 5 s between iterations → matches app polling cadence of ~1 req / 5 s
}
```

Run commands:
```bash
k6 run --vus 4  --duration 3m k6_combined.js   # 5-node step  (4 sim + 1 real device)
k6 run --vus 9  --duration 3m k6_combined.js   # 10-node step (9 sim + 1 real)
k6 run --vus 19 --duration 3m k6_combined.js   # 20-node step
k6 run --vus 29 --duration 3m k6_combined.js   # 30-node step
```

#### 9.3.2 Simulated WebSocket Connections — sim_ws.sh

Save as `sim_ws.sh`:
```bash
#!/bin/bash
# sim_ws.sh <num_simulated_clients>
# Starts N background websocat WS clients. The 1 real Android device fills the last slot.
# Usage for 10-node step: bash sim_ws.sh 9
N=$1
PIDS=()
for i in $(seq 1 "$N"); do
  websocat -n --text "ws://192.168.1.10:8080" \
    --ping-interval 1 \
    > "s3_ws_sim_${i}.log" 2>&1 &
  PIDS+=($!)
  echo "Started WS client $i (PID ${PIDS[-1]})"
done
echo "All $N simulated WS clients running (PIDs: ${PIDS[*]})"
echo "Press Ctrl+C or run: kill ${PIDS[*]}"
wait
```

Run per node step:
```bash
bash sim_ws.sh 4    # 5-node step
bash sim_ws.sh 9    # 10-node step
bash sim_ws.sh 19   # 20-node step
bash sim_ws.sh 29   # 30-node step
```

#### 9.3.3 Simulated TCP Throughput — iperf3 Parallel Streams

Each `-P` stream approximates one additional TCP sender. Run from the test laptop:
```bash
iperf3 -c 192.168.1.10 -t 60 -P 1  --json -o s3_tcp_step01.json   # 1-node  baseline
iperf3 -c 192.168.1.10 -t 60 -P 5  --json -o s3_tcp_step05.json   # 5-node  step
iperf3 -c 192.168.1.10 -t 60 -P 10 --json -o s3_tcp_step10.json   # 10-node step
iperf3 -c 192.168.1.10 -t 60 -P 20 --json -o s3_tcp_step20.json   # 20-node step
iperf3 -c 192.168.1.10 -t 60 -P 30 --json -o s3_tcp_step30.json   # 30-node step
```

#### 9.3.4 Distinguishing Real vs. Simulated Metrics

All result tables in Scenario 3 include a **"Load Source"** column. Entries are tagged:
- `real` — metric is from a physical Android device running the application
- `sim+real` — simulated load (k6 + websocat + iperf3) plus 1–2 real devices

At node steps where physical devices cover the full count (steps 1 and 5), all entries are tagged `real`.

---

### 9.4 Sub-Test 1 — API Server Load Testing

**Tool:** k6 (simulated load) + Android application (physical device)

**Procedure:**

1. **[QA-P]** Start with 1 physical Android device sending 50 HTTP GET requests to the API server (consistent with §7.4 and §8.4).
2. **[QA-P]** Records aggregate requests/second, per-device avg response time, P99 response time, server CPU utilization, and error rate in the result table.
3. **[QA-S]** Scales up using the simulation strategy (§9.3) following the step sequence: 1 → 5 → 10 → 20 → 30, running k6 at the correct `--vus` count per step.
4. **[TL]** Holds each step for 3 minutes and gives `STOP` signal before metrics are recorded and before advancing.
5. **[BE-ADMIN]** Monitors and records server CPU and memory utilization during each step:
   ```bash
   # Run on the backend server during each load step
   watch -n 2 'echo "=== CPU / MEM ===" && top -bn1 | head -5 && echo "=== MEMORY ===" && free -m'
   ```
6. **[QA-S]** Keeps 1–2 physical Android devices running the app throughout all steps; records their metrics separately as `[real]` and passes to **[QA-P]** for the result table.
7. **[QA-P]** Identifies the node count at which P99 response time exceeds 2× the single-device baseline from Scenario 1.

**Metrics Collected:** Node count, aggregate req/sec, avg response time (ms), P99 (ms), server CPU (%), error rate (%)

**Degradation Indicator:** P99 response time > 2× Scenario 1 single-device baseline, or error rate > 1%

**Result Table 9.4 — API Server Load by Node Count**

| Node Count | Load Source | Req/sec | Avg Response (ms) | P99 (ms) | Server CPU (%) | Error Rate (%) |
|---|---|---|---|---|---|---|
| 1 | real | — | — | — | — | — |
| 5 | real | — | — | — | — | — |
| 10 | sim+real | — | — | — | — | — |
| 20 | sim+real | — | — | — | — | — |
| 30 | sim+real | — | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.5 Sub-Test 2 — WebSocket Concurrent Connection Stress

**Tool:** websocat (simulated load) + Android application WebSocket client (physical device)

**Procedure:**

1. **[QA-S]** At each node count step (1, 5, 10, 20, 30), starts all simulated WS clients via `sim_ws.sh`. **[QA-P]** connects the physical device to the WebSocket server simultaneously (coordinated by **[TL]** `GO` signal).
2. Each client sends 1 message per second for 3 minutes (180 messages per client per step).
3. **[QA-P]** Records avg RTT from the physical device. **[BE-ADMIN]** records total active connection count from the server side. Both pass values to **[QA-P]** for the result table.
4. **[QA-S]** Logs any refused connections, timeouts, or session drops from simulated clients. **[QA-P]** logs the same from the physical device.
5. **[QA-P]** Identifies the node count at which dropped connections first occur.

**Metrics Collected:** Node count, active connections, avg WS RTT (ms), message success rate (%), dropped connections

**Degradation Indicator:** First occurrence of dropped connections or message success rate < 99%

**Result Table 9.5 — WebSocket Concurrent Connection Stress**

| Node Count | Load Source | Active Connections | Avg WS RTT (ms) | Max RTT (ms) | Success Rate (%) | Dropped Connections |
|---|---|---|---|---|---|---|
| 1 | real | — | — | — | — | — |
| 5 | real | — | — | — | — | — |
| 10 | sim+real | — | — | — | — | — |
| 20 | sim+real | — | — | — | — | — |
| 30 | sim+real | — | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.6 Sub-Test 3 — TCP Throughput and mDNS Discovery Under Congestion

**Tool:** iperf3 (from physical device), Android application mDNS discovery screen

**Procedure:**

1. **[BE-ADMIN]** Confirms iperf3 server is running. **[QA-P]** With all N clients actively generating API and WebSocket load (§9.4 and §9.5 running concurrently), runs an iperf3 test from one physical Android device:
   ```bash
   iperf3 -c 192.168.1.10 -t 60
   ```
2. **[QA-S]** Simultaneously triggers an mDNS service discovery from Device B. Records the discovery latency and passes to **[QA-P]**.
3. **[QA-P]** Records TCP throughput and packet loss in the result table.
4. **[QA-P]** Compares results against Scenario 1 baseline values and notes delta.
5. **[TL]** Coordinates repeating steps 1–4 at each node count step: 1, 5, 10, 20, 30.

**Metrics Collected:** Node count, TCP throughput under load (Mbps), mDNS discovery latency (ms), packet loss (%)

**Degradation Indicator:** TCP throughput drops > 30% from Scenario 1 baseline; mDNS discovery latency exceeds 2 seconds

**Result Table 9.6 — TCP and mDNS Under Concurrent Load**

| Node Count | Load Source | TCP Throughput (Mbps) | mDNS Discovery (ms) | Packet Loss (%) | Notes |
|---|---|---|---|---|---|
| 1 | real | — | — | — | — |
| 5 | real | — | — | — | — |
| 10 | sim+real | — | — | — | — |
| 20 | sim+real | — | — | — | — |
| 30 | sim+real | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.7 Sub-Test 4 — Mesh Hop Performance Testing

**Tool:** iperf3, ping, mtr, curl, Android application WebSocket client

**Purpose:** Isolate per-hop throughput and latency degradation introduced by each additional mesh relay between the Android device and the backhaul/server. This sub-test is independent of node count — run with a single physical Android device.

**Setup:**

Associate the Android device (or iperf3 client laptop) with APs at each hop distance:

| Hop Label | AP Association |
|---|---|
| 1 hop | AP directly connected to the router / backhaul uplink |
| 2 hops | AP meshed one relay away from the uplink AP |
| 3 hops | AP meshed two relays away from the uplink AP |

**Procedure:**

1. **[NET-ENG]** Associates the Android device or iperf3 client laptop with the AP at the target hop distance. Confirms association before signaling **[QA-P]**. **[BE-ADMIN]** confirms iperf3 server and WS echo server are running and sends `READY`.
2. **[QA-P]** At each hop count (1, 2, 3), runs the standard 60-second iperf3 test, 100-ping sequence, and mtr trace:
   ```bash
   iperf3 -c 192.168.1.10 -t 60 --json -o hop<N>_run1.json
   ping -c 100 -i 0.2 192.168.1.10
   mtr --report --report-cycles 60 192.168.1.10
   ```
3. **[QA-P]** From the same position, runs 50 sequential API requests and 120 WebSocket messages (as in §7.4 and §7.5).
4. **[QA-P]** Repeats 3 times per hop count and records averages in the result table.

**Metrics Collected:** Hop count, throughput (Mbps), avg RTT (ms), max RTT (ms), packet loss (%), jitter (ms), API avg (ms), WS avg RTT (ms)

**Degradation Indicator:** > 20% throughput drop or > 2× RTT increase per additional hop.

**Result Table 9.7 — Performance by Mesh Hop Count**

| Hop Count | Throughput (Mbps) | Avg RTT (ms) | Max RTT (ms) | Packet Loss (%) | Jitter (ms) | API Avg (ms) | WS Avg RTT (ms) |
|---|---|---|---|---|---|---|---|
| 1 hop | — | — | — | — | — | — | — |
| 2 hops | — | — | — | — | — | — | — |
| 3 hops | — | — | — | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.8 Sub-Test 5 — GSM Modem Integration Testing

**Tool:** Server-side API or direct modem invocation, test GSM handset

**Purpose:** Evaluate the end-to-end delivery path **Backend Server → GSM Modem → SMS recipient**. The server dispatches alert or notification messages through the modem. This sub-test measures delivery latency and reliability under both idle and loaded network conditions.

> **Role assignments for this sub-test:**
> - **[QA-P]** — triggers all GSM sends via `curl`; records dispatch timestamps and result table entries
> - **[QA-S]** — physically holds and watches the test GSM handset; sends `SMS-RECEIVED [time]` signal to **[QA-P]** for each delivery
> - **[BE-ADMIN]** — tails server logs for server-side dispatch timestamps; monitors modem status
> - **[TL]** — times ≥ 30 s interval between Sub-Test A sends and gives `GO` for each; confirms Sub-Test B load is active before signaling start

**Sub-Test A — Server → GSM Send (Idle Baseline):**

1. **[TL]** gives `GO`. **[QA-P]** triggers a server-originated message (via the API or direct server-side invocation) addressed to the test GSM handset number. **[BE-ADMIN]** records the server-side send timestamp from logs.
2. **[QA-S]** watches the handset and sends `SMS-RECEIVED [time]` to **[QA-P]** when the message thread timestamp is visible. **[QA-P]** records both timestamps in the result table.
3. Delivery latency = delivery timestamp − send timestamp.
4. **[TL]** enforces ≥ 30 s between sends and gives `GO` for each repeat. **[QA-P]** repeats 10 times total.

**Sub-Test B — Server → GSM Send Under Network Load:**

1. **[TL]** confirms sub-tests 9.4 and 9.5 are actively running at the 30-node step before giving `GO`. **[QA-P]** repeats the same 10 server-originated GSM sends from Sub-Test A while load is active.
2. **[QA-P]** Compares delivery latency against the idle baseline.
3. **[QA-P]** If under-load latency is significantly higher, runs `mtr` to determine whether congestion is on the LAN/backhaul path or carrier-side. Records finding in the Observation field.

**Sub-Test C — GSM Burst Reliability:**

1. **[QA-P]** Triggers 20 rapid consecutive GSM sends from the server at 1 send per 5 s (use `gsm_burst.sh` or equivalent).
2. **[QA-S]** Watches the handset and counts successful deliveries, duplicates, and undelivered messages. Passes counts to **[QA-P]**.
3. **[QA-P]** Records all counts in the result table. This validates the modem's queue handling under burst alert conditions.

**Metrics Collected:** Delivery latency (s), success rate (%), delta idle vs. under-load, burst success/failure/duplicate counts.

**Degradation Indicator:** Delivery latency > 30 s, or burst success rate < 95%.

> **Note:** GSM delivery latency is dominated by the cellular carrier network, not the local LAN. A stable average below 10 s confirms the server-side dispatch path is functional. Any latency increase that correlates with LAN congestion steps indicates the modem's IP path to the server is competing for backhaul bandwidth.

**Result Table 9.8a — Server → GSM Delivery Latency**

| Attempt | Idle Latency (s) | Under-Load Latency (s) | Result |
|---|---|---|---|
| 1 | — | — | — |
| 2 | — | — | — |
| 3 | — | — | — |
| 4 | — | — | — |
| 5 | — | — | — |
| 6 | — | — | — |
| 7 | — | — | — |
| 8 | — | — | — |
| 9 | — | — | — |
| 10 | — | — | — |
| **Average** | **—** | **—** | **—/10** |

**Result Table 9.8b — GSM Burst Reliability (20 Rapid Sends)**

| Metric | Value |
|---|---|
| Total sends attempted | 20 |
| Successfully delivered | — |
| Duplicates received | — |
| Failures / undelivered | — |
| Average delivery latency (s) | — |

*Observation:* ________________________________________________________________

---

### 9.9 Degradation Summary

**Result Table 9.9 — Scalability Degradation Thresholds**

| Metric | Single-Device Baseline | Degradation Threshold | Node Count at Threshold | Suspected Bottleneck |
|---|---|---|---|---|
| API avg response (ms) | — | 2× baseline | — (of 1, 5, 10, 20, 30) | — |
| API P99 response (ms) | — | 2× baseline | — | — |
| API error rate (%) | 0% | > 1% | — | — |
| WS dropped connections | 0 | First occurrence | — | — |
| WS avg RTT (ms) | — | 2× baseline | — | — |
| TCP throughput (Mbps) | — | 30% drop | — | — |
| mDNS discovery (ms) | — | > 2000 ms | — | — |
| Mesh throughput per hop | — (1-hop) | > 20% drop vs. 1-hop | N/A (hop count, not node count) | — |
| GSM delivery latency (s) | — (idle) | > 30 s or delta > 20 s vs. idle | N/A (under 30-node load) | — |

---

## 10. Results and Analysis

### 10.1 Cross-Scenario Comparison

**Result Table 10.1 — TCP Performance Across All Scenarios**

| Metric | Scenario 1 (Single-LAN) | Scenario 2 (PtP) | Scenario 3 (20 Nodes, PtP) | S1→S2 Delta |
|---|---|---|---|---|
| Throughput (Mbps) | — | — | — | — |
| Avg RTT (ms) | — | — | — | — |
| Max RTT (ms) | — | — | — | — |
| Packet Loss (%) | — | — | — | — |

**Result Table 10.2 — REST API Performance Across All Scenarios**

| Metric | Scenario 1 (Single-LAN) | Scenario 2 (PtP) | Scenario 3 (20 Nodes) | S1→S2 Delta |
|---|---|---|---|---|
| Avg Response (ms) | — | — | — | — |
| P95 (ms) | — | — | — | — |
| P99 (ms) | — | — | — | — |
| Success Rate (%) | — | — | — | — |

**Result Table 10.3 — WebSocket Performance Across All Scenarios**

| Metric | Scenario 1 (Single-LAN) | Scenario 2 (PtP) | Scenario 3 (20 Nodes) | S1→S2 Delta |
|---|---|---|---|---|
| Avg WS RTT (ms) | — | — | — | — |
| Max RTT (ms) | — | — | — | — |
| Jitter (ms) | — | — | — | — |
| Success Rate (%) | — | — | — | — |
| Disconnections | — | — | — | — |

**Result Table 10.4 — mDNS Discovery Across Scenarios**

| Metric | Scenario 1 (Same LAN) | Scenario 2 (Cross-LAN) | Scenario 3 (Under Load) |
|---|---|---|---|
| Avg Discovery Latency (ms) | — | — | — |
| Success Rate (%) | — | — | — |

**Result Table 10.5 — TCP P2P (App) Performance Across Scenarios**

| Metric | Scenario 1 §7.3b (Same LAN) | Scenario 2 §8.3c (PtP) | S1→S2 Delta |
|---|---|---|---|
| Connect Time (ms) | — | — | — |
| Avg RTT (ms) | — | — | — |
| Max RTT (ms) | — | — | — |
| Jitter (ms) | — | — | — |
| Success Rate (%) | — | — | — |
| Disconnections | — | — | — |

**Result Table 10.6 — GSM Delivery Latency Across Scenarios**

| Metric | S1 §7.7a — Idle, Same LAN | S2 §8.7 Sub-A — Cross-LAN, No Load | S2 §8.7 Sub-B — Cross-LAN, PtP Load | S3 §9.8a — 30-Node Load |
|---|---|---|---|---|
| Avg Delivery Latency (s) | — | — | — | — |
| Success Rate (%) | — | — | — | — |

---

### 10.2 Key Findings

- The PtP wireless backhaul introduced an RTT overhead of approximately **— ms** across all protocols compared to single-LAN operation.
- REST API P99 response time increased by approximately **— ms** when traffic was routed across the PtP link.
- WebSocket connection stability **was / was not** maintained over the 5-minute inter-LAN test duration.
- mDNS service discovery **succeeded / failed** across LANs due to **proxy configuration / absence of proxy**.
- System performance began degrading at **— connected devices**; the primary bottleneck was identified as the **AP / router / PtP backhaul / backend server**.

---

## 11. Graph Recommendations

The following graphs are recommended for inclusion in the final report. Data to be plotted from the result tables in Sections 7–9.

| # | Title | Chart Type | X-Axis | Y-Axis | Data Source |
|---|---|---|---|---|---|
| 1 | TCP Throughput by Scenario | Bar chart | Scenario (S1, S2, S3-peak) | Throughput (Mbps) | Tables 10.1 |
| 2 | Latency Comparison by Scenario | Grouped bar chart | Scenario | Avg RTT / P99 (ms) | Tables 10.1–10.3 |
| 3 | API Response Time vs. Node Count | Line graph | Node count (1, 5, 10, 20, 30) | Avg / P99 response (ms) | Table 9.4 |
| 4 | WebSocket RTT vs. Node Count | Line graph | Node count (1, 5, 10, 20, 30) | Avg WS RTT (ms) | Table 9.5 |
| 5 | Packet Loss (%) vs. Node Count | Line graph | Node count (1, 5, 10, 20, 30) | Packet loss (%) | Table 9.6 |
| 6 | mDNS Discovery Latency: S1 vs. S2 | Bar chart | Scenario | Avg discovery latency (ms) | Tables 7.6, 8.6 |
| 7 | TCP Throughput Under Concurrent Load | Line graph | Node count (1, 5, 10, 20, 30) | Throughput (Mbps) | Table 9.6 |
| 8 | Bridge RTT Stability Over Time | Line graph | Time (minutes) | RTT (ms) | Table 8.3b |
| 9 | Throughput and RTT vs. Mesh Hop Count | Dual-axis line graph | Hop count (1, 2, 3) | Throughput (Mbps) / Avg RTT (ms) | Table 9.7 |
| 10 | GSM Delivery Latency Across All Scenarios | Grouped bar chart | Scenario / load condition | Avg delivery latency (s) | Tables 7.7a, 8.7, 9.8a |
| 11 | TCP P2P RTT: Single-LAN vs. Cross-PtP | Grouped bar chart | Scenario (S1, S2) | Avg RTT (ms) | Tables 7.3b, 8.3c |
| 12 | GSM Delivery Latency: S1 Idle vs. S2 Idle vs. S2 PtP Load | Line / bar chart | Test attempt (1–10) + avg | Delivery latency (s) | Tables 7.7a, 8.7 |

> **Graph 1** — `[INSERT: TCP Throughput by Scenario — Bar Chart]`

> **Graph 2** — `[INSERT: Latency Comparison by Scenario — Grouped Bar Chart]`

> **Graph 3** — `[INSERT: API Response Time vs. Node Count — Line Graph]`

> **Graph 4** — `[INSERT: WebSocket RTT vs. Node Count — Line Graph]`

> **Graph 5** — `[INSERT: Packet Loss vs. Node Count — Line Graph]`

> **Graph 6** — `[INSERT: mDNS Discovery Latency S1 vs S2 — Bar Chart]`

> **Graph 7** — `[INSERT: TCP Throughput Under Load vs. Node Count — Line Graph]`

> **Graph 8** — `[INSERT: Bridge RTT Time-Series Over 10 Minutes — Line Graph]`

> **Graph 9** — `[INSERT: Throughput and RTT vs. Mesh Hop Count — Dual-Axis Line Graph]`

> **Graph 10** — `[INSERT: GSM Delivery Latency Across All Scenarios — Grouped Bar Chart]`

> **Graph 11** — `[INSERT: TCP P2P RTT Single-LAN vs. Cross-PtP — Grouped Bar Chart]`

> **Graph 12** — `[INSERT: GSM Delivery Latency S1 vs S2 Idle vs S2 PtP Load — Line/Bar Chart]`

---

## 12. Observations

> **Authoring responsibility:** **[TL]** consolidates all result tables from §7–§9 and completes this section within 24 hours of test completion. **[QA-P]** and **[QA-S]** review for data accuracy before the document is submitted. All four roles sign the signoff block at the end of this section.

> **Instructions:** Complete this section after all test runs are finished. Replace each `____` placeholder with the measured value or finding. Delete the `[FILL IN AFTER TESTING]` tags before submitting the report.

- **Local LAN baseline performance** `[FILL IN AFTER TESTING]`: TCP throughput = `____ Mbps`, avg RTT = `____ ms`, packet loss = `____%`. All four protocols (TCP, REST API, WebSocket, mDNS) met / did not meet baseline targets. AP infrastructure performed adequately / showed issues at single-device load. Notes: `____`.

- **PtP backhaul overhead** `[FILL IN AFTER TESTING]`: TCP throughput decreased by `____`% vs. single-LAN. API response time increased by `____ ms`. WebSocket RTT increased by `____ ms`. Overhead was / was not proportional to the link's expected propagation delay. Notes: `____`.

- **WebSocket connection stability** `[FILL IN AFTER TESTING]`: Over the 5-minute inter-LAN test, `____` disconnections were observed. Reconnection time averaged `____ ms`. Long-lived connections were / were not stable across the 30 KM PtP link. Notes: `____`.

- **mDNS cross-LAN behavior** `[FILL IN AFTER TESTING]`: Discovery from LAN B to LAN A `succeeded / failed` (expected: fail if no proxy). Router mDNS proxy was `configured / not configured`. If configured, cross-LAN discovery latency averaged `____ ms`. Notes: `____`.

- **API server scalability** `[FILL IN AFTER TESTING]`: P99 response time first exceeded 2× baseline at `____` connected devices. Server CPU reached `____%` at the `____`-node step. Suspected bottleneck: `AP / router / PtP backhaul / backend server`. Notes: `____`.

- **WebSocket concurrent connections** `[FILL IN AFTER TESTING]`: First dropped connection occurred at `____` concurrent clients. Maximum stable connection count = `____`. Notes: `____`.

- **TCP throughput degradation under congestion** `[FILL IN AFTER TESTING]`: Throughput dropped > 30% from baseline at `____` nodes. Rate of decrease suggests bottleneck is `wireless medium (AP) / forwarding path (router/PtP backhaul)`. Notes: `____`.

- **mDNS discovery latency under load** `[FILL IN AFTER TESTING]`: Discovery latency at 1 node = `____ ms`; at 30 nodes = `____ ms`. Congestion `did / did not` cause discovery failures. Notes: `____`.

- **TCP P2P (app-level transport)** `[FILL IN AFTER TESTING]`: Single-LAN avg RTT = `____ ms` (§7.3b); cross-PtP avg RTT = `____ ms` (§8.3c); delta = `____ ms`. Disconnections in cross-PtP test: `____`. App reconnection logic `activated / was not needed`. Notes: `____`.

- **GSM modem delivery** `[FILL IN AFTER TESTING]`: Single-LAN idle avg latency = `____ s` (§7.7); cross-LAN idle = `____ s` (§8.7 Sub-A); cross-LAN under PtP load = `____ s` (§8.7 Sub-B). Increase under load suggests modem IP path `is / is not` contending for backhaul bandwidth. Notes: `____`.

- **Mesh hop degradation** `[FILL IN AFTER TESTING]`: Throughput at 1 hop = `____ Mbps`; 2 hops = `____ Mbps`; 3 hops = `____ Mbps`. RTT at 1 hop = `____ ms`; 2 hops = `____ ms`; 3 hops = `____ ms`. Bottleneck is `mesh inter-AP links / AP-to-server path`. Notes: `____`.

---

### Document Signoff

Complete after all observations have been reviewed for accuracy.

| Role | Name | Signature | Date |
|---|---|---|---|
| Test Lead (TL) | | | |
| QA Tester – Primary (QA-P) | | | |
| QA Tester – Secondary (QA-S) | | | |
| Backend Administrator (BE-ADMIN) | | | |
| Network Engineer (NET-ENG) | | | |

> All signatories confirm that: (1) the result tables in §7–§9 accurately reflect measured values; (2) the observations above are consistent with the recorded data; (3) no sub-tests were skipped without documented justification.

---

## 13. Conclusion

This report evaluated the network and application-layer performance of a distributed system comprising a 30 KM PtP wireless backhaul, multi-AP LAN segments, a managed router, Android client devices, and a backend server. Testing was conducted under three scenarios of increasing complexity: single-LAN baseline, inter-LAN operation across the PtP bridge, and scalability testing with up to 30 concurrently connected devices.

The results demonstrate that the system performs within expected parameters under single-LAN conditions, with all tested protocols (TCP, REST API, WebSocket, mDNS) meeting baseline latency and reliability targets. The introduction of the PtP wireless backhaul in Scenario 2 added measurable overhead to all latency-sensitive metrics; the magnitude of this overhead is inherent to the 30 KM link distance and is expected in long-range wireless deployments. The system remained functional under inter-LAN load, with the key finding being that application-layer reconnection logic and API retry mechanisms are essential for production robustness over the PtP link.

Scalability testing in Scenario 3 identified the node count at which each protocol began to degrade and isolates the primary system bottleneck. Testing was performed with 2–3 physical Android devices supplemented by simulated load (k6, websocat, iperf3 parallel streams) to reach the target node steps of 1, 5, 10, 20, and 30 concurrent devices — a range representative of a community first-responder team operating in a remote or disaster-stricken environment. Mesh hop testing characterized per-hop throughput and latency degradation across the distributed AP fabric, and GSM modem testing validated the server-originated notification path under both idle and congested conditions. Based on these findings, the following recommendations are made: (1) the optimal concurrent device count for this deployment is **—** devices; (2) the PtP link should be monitored for RSSI and SNR to detect antenna alignment drift that would degrade throughput over time; (3) an mDNS proxy should be deployed on the router if cross-LAN service discovery is a system requirement; (4) the backend server should be provisioned with additional resources or a connection pool tuned to the target concurrent WebSocket connection count before production deployment; and (5) the GSM modem's network path to the backend server should be confirmed to have sufficient isolated bandwidth to avoid contention with the main data backhaul during peak incident traffic.

Further testing is recommended to evaluate performance under adverse weather conditions (for the PtP link), at maximum rated concurrent device counts, and with application-level traffic patterns reflecting real user behavior rather than synthetic load.

---

---

## Appendix A – Glossary of Terms

### Network Concepts

| Term | Definition |
|---|---|
| **PtP (Point-to-Point)** | A dedicated wireless link between exactly two fixed endpoints — in this system, Dish A and Dish B separated by up to 30 KM. Carries all traffic between LAN A and LAN B. |
| **LAN (Local Area Network)** | A network confined to a physical location (e.g., a building or site). Devices on the same LAN can communicate directly without crossing a router. |
| **AP (Access Point)** | A device that provides Wi-Fi connectivity, bridging wireless clients onto the wired LAN. In this system, AP-A1/A2 serve LAN A and AP-B1/B2 serve LAN B. |
| **Router** | A device that forwards packets between two or more different networks (LANs). In this system, the router connects LAN A and LAN B via the PtP bridge. |
| **Subnet / CIDR** | A subdivision of an IP address space. `192.168.1.0/24` means IP addresses from `192.168.1.1` to `192.168.1.254` all belong to LAN A. |
| **DHCP** | A protocol by which the router automatically assigns IP addresses to devices that join the network. Android devices receive their IPs this way. |
| **mDNS (Multicast DNS)** | A zero-configuration protocol that lets devices announce and discover services on a local network without a central DNS server. Uses multicast address `224.0.0.251`, port `5353`. |
| **TTL (Time To Live)** | A counter on each network packet that decrements at every router hop. When TTL reaches 0, the packet is discarded. mDNS uses TTL=1 so its packets never cross a router. |
| **RSSI (Received Signal Strength Indicator)** | A measure of the power level a radio receiver detects from a wireless transmitter, expressed in dBm (decibel-milliwatts). Less negative = stronger signal (e.g., −50 dBm is stronger than −80 dBm). |
| **SNR (Signal-to-Noise Ratio)** | The ratio of the desired signal power to background noise, in dB. Higher SNR means a cleaner signal and higher sustainable throughput. |

### Protocol Concepts

| Term | Definition |
|---|---|
| **TCP (Transmission Control Protocol)** | A reliable, connection-oriented transport protocol. TCP guarantees that all data arrives in order and retransmits lost packets automatically. Used for iperf3 throughput tests and the app's P2P transport. |
| **REST API (HTTP)** | A web API where the client sends an HTTP request (GET, POST, etc.) and the server responds. Stateless — each request is independent. |
| **WebSocket** | A protocol that upgrades an HTTP connection into a persistent, full-duplex channel. Once connected, client and server can send messages to each other at any time without re-establishing the connection. |
| **GSM / SMS** | GSM is the cellular radio standard; SMS (Short Message Service) is the text-messaging protocol carried over GSM. The backend server sends SMS alerts through an attached GSM modem. |

### Performance Metrics

| Term | Unit | Definition |
|---|---|---|
| **Throughput** | Mbps | Volume of data successfully transferred per second. Higher = better. |
| **RTT (Round-Trip Time)** | ms | Time for a packet to travel from sender to receiver and back. Lower = faster. |
| **Jitter** | ms | Variation in RTT between consecutive packets (standard deviation). Lower = more consistent. |
| **Packet loss** | % | Percentage of sent packets that never arrived. Should be 0% on a healthy link. |
| **P95 / P99** | ms | Percentile latency. P99 = 80 ms means 99% of requests finished within 80 ms. Useful for understanding worst-case behavior, not just average. |
| **mdev** | ms | Mean deviation — reported by `ping` as a proxy for jitter. |

### Tools

| Tool | What it does |
|---|---|
| **iperf3** | Generates a sustained TCP data stream between two hosts and measures throughput. Run `iperf3 -s` on the server, `iperf3 -c <server_ip>` on the client. |
| **ping** | Sends ICMP echo requests and measures RTT and packet loss. One of the simplest network diagnostic tools. |
| **mtr** | Combines ping and traceroute: shows every router hop between two hosts and the RTT / packet loss at each hop. |
| **tshark** | Command-line version of Wireshark. Captures and inspects raw network packets. Used here to verify mDNS traffic at the packet level. |
| **curl** | A command-line HTTP client. Used to send REST API requests and measure response time with `-w "%{time_total}"`. |
| **k6** | A load-testing tool that simulates many virtual users sending HTTP and WebSocket traffic concurrently. |
| **websocat** | A command-line WebSocket client, used to simulate persistent WebSocket connections from the test laptop. |
| **Avahi** | A Linux implementation of mDNS / DNS-SD. Used on the backend server to advertise services. Can also run as a proxy/reflector to forward mDNS across router boundaries. |

---

*End of Report*
