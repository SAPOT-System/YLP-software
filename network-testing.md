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

1. [Introduction](#1-introduction)
2. [Objectives](#2-objectives)
3. [System Architecture](#3-system-architecture)
4. [Test Environment](#4-test-environment)
5. [Testing Tools and Applications](#5-testing-tools-and-applications)
6. [General Testing Methodology](#6-general-testing-methodology)
7. [Scenario 1 – Single-LAN Operation](#7-scenario-1--single-lan-operation)
8. [Scenario 2 – Multi-LAN Operation Across PtP Link](#8-scenario-2--multi-lan-operation-across-ptp-link)
9. [Scenario 3 – Scalability Testing with Increasing Connected Devices](#9-scenario-3--scalability-testing-with-increasing-connected-devices)
10. [Results and Analysis](#10-results-and-analysis)
11. [Graph Recommendations](#11-graph-recommendations)
12. [Observations](#12-observations)
13. [Conclusion](#13-conclusion)
- [Appendix A – Glossary of Terms](#appendix-a--glossary-of-terms)

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
| Android Devices (×20) | Client nodes | — | Android — | Minimum 20 devices for Scenario 3 |

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
| wscat or websocat | — | WebSocket testing from non-Android host |

### 4.3 Test Conditions

| Parameter | Value |
|---|---|
| Test duration per run | 60 seconds (TCP/WebSocket); 50 requests (API); 10 attempts (mDNS) |
| Number of repetitions | 3 per sub-test; results averaged |
| Averaging policy | Re-run if variance between runs exceeds 10% |
| Bridge stability test duration | 10 minutes (600 pings at 1 s interval) |
| Scalability step hold duration | 3 minutes at each node count step |
| Environmental conditions | — (document: indoor/outdoor, time of day, weather if applicable) |
| PtP link distance | Up to 30 KM |
| Channel / frequency | — |

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

```bash
# Capture mDNS traffic
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
curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/api/endpoint
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
| Jitter | ms | Standard deviation of RTT across consecutive samples | ping (mdev), application timestamps |
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
3. WebSocket performance (application or wscat)
4. mDNS discovery (application + tshark)
5. GSM modem delivery (curl + test handset)

All active test sessions from a previous sub-test are terminated before the next sub-test begins.

```
  START SCENARIO
       │
       ▼
  ┌─────────────────────────────────┐
  │ 1. TCP  — iperf3 + ping + mtr  │
  └─────────────────┬───────────────┘
                    │ terminate iperf3, ping
                    ▼
  ┌─────────────────────────────────┐
  │ 2. REST API  — curl / app       │
  └─────────────────┬───────────────┘
                    │ terminate curl sessions
                    ▼
  ┌─────────────────────────────────┐
  │ 3. WebSocket  — app / wscat     │
  └─────────────────┬───────────────┘
                    │ close WS connections
                    ▼
  ┌─────────────────────────────────┐
  │ 4. mDNS  — app + tshark        │
  └─────────────────┬───────────────┘
                    │ stop tshark capture
                    ▼
  ┌─────────────────────────────────┐
  │ 5. GSM  — curl + test handset  │
  └─────────────────┬───────────────┘
                    │
                    ▼
          END SCENARIO / NEXT
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

---

### 7.3 Sub-Test 1 — TCP Performance

**Tool:** iperf3, ping, mtr

**Procedure:**

1. On the backend server, start the iperf3 listener:
   ```bash
   iperf3 -s
   ```
2. From the Android device (or a test laptop on LAN A), run a 60-second TCP throughput test:
   ```bash
   iperf3 -c 192.168.1.10 -t 60 -i 5 --json -o s1_tcp_run1.json
   ```
3. Measure RTT and packet loss:
   ```bash
   ping -c 100 -i 0.2 192.168.1.10
   ```
4. Trace per-hop latency:
   ```bash
   mtr --report --report-cycles 60 192.168.1.10
   ```
5. Repeat steps 2–4 three times. Record average values.

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

**Setup:**
- Device A (physical Android): starts app TCP server; listens on a dynamically assigned port
- Device B (second physical device or simulation laptop): connects as TCP client
- The listening port must be discovered before each run — the app assigns it at runtime

**Procedure:**
0. After enabling TCP server mode in the app on Device A, discover its LAN IP and port via ADB:
   ```bash
   TCP_PORT=$(adb -s <DEVICE_A_SERIAL> shell ss -tlnp \
     | awk '/tcp.*LISTEN/{print $4}' | grep -oE '[0-9]+$' | tail -1)
   DEVICE_A_IP=$(adb -s <DEVICE_A_SERIAL> shell ip -4 addr show wlan0 \
     | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
   echo "Device A: $DEVICE_A_IP : $TCP_PORT"
   ```
1. On Device A, enable TCP server mode in the application. Confirm listening (Step 0).
2. From Device B or the simulation laptop, run 120 echo messages at 500 ms intervals:
   ```bash
   python3 sim_tcp_client.py $DEVICE_A_IP $TCP_PORT 1 60
   ```
3. Record per-message RTT, connection establishment time, success rate, and disconnection count.
4. Repeat 3 times. Terminate connection between runs.

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

1. Verify server API is reachable:
   ```bash
   curl -I http://192.168.1.10/api/health
   ```
2. Execute 50 sequential HTTP GET requests and record per-request response time:
   ```bash
   for i in $(seq 1 50); do
     curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/api/endpoint
   done
   ```
3. Calculate avg, P95, and P99 response times from the 50 recorded values.
4. Record the number of failed requests (non-2xx responses or timeouts).
5. Repeat the full 50-request sequence 3 times.

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

**Tool:** Android application WebSocket client (or wscat / websocat)

**Procedure:**

1. Establish a WebSocket connection from the Android device to the server:
   ```
   ws://192.168.1.10:<port>
   ```
2. Send a timestamped message every 500 ms for 60 seconds (120 total messages per run).
3. Server echoes each message with a server-side timestamp appended.
4. Compute per-message RTT:
   ```
   message_RTT = echo_received_time − message_sent_time
   ```
5. Record avg RTT, max RTT, jitter (std deviation), message success rate, and disconnection count.
6. Repeat 3 times. Terminate and re-establish connection between runs.

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

1. On the backend server, start mDNS service advertisement (e.g., via Avahi):
   ```bash
   avahi-publish-service "BackendService" _http._tcp 8080 &
   ```
2. Start packet capture on the server interface:
   ```bash
   sudo tshark -i <interface> -f "udp port 5353" -w s1_mdns.pcapng
   ```
3. On the Android device, trigger the mDNS service discovery function in the application. Record the time from the discovery query being issued to the service record being resolved (as reported by the application).
4. Repeat 10 discovery attempts. Allow at least 5 seconds between attempts to allow mDNS caches to clear.
5. Stop tshark capture. Verify query and response packets are present in the capture file.

**Metrics Collected:** Discovery latency per attempt (ms), success rate (%), avg discovery latency (ms)

**Repetitions:** 10 individual discovery attempts

**Expected Behavior:** Discovery within 100–500 ms in a single-LAN environment. All 10 attempts successful. No failed discoveries expected under normal conditions.

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

**Procedure:**

**Sub-Test A — Idle Delivery Baseline (10 sends):**

1. Confirm the server GSM endpoint is reachable:
   ```bash
   curl -I http://192.168.1.10:8000/api/gsm/send
   ```
2. Send one server-originated GSM message and record the HTTP response time (proxy for server dispatch latency):
   ```bash
   curl -s -w "\nHTTP %{http_code}  dispatch %{time_total}s\n" \
        -X POST http://192.168.1.10:8000/api/gsm/send \
        -H "Content-Type: application/json" \
        -d '{"to": "<TEST_HANDSET_NUMBER>", "message": "S1-A-1"}'
   ```
   Record `Server Send Time` from server logs or the response timestamp. Record `SMS Arrival Time` when the message appears on the test handset.
3. Repeat 10 times with ≥ 30 s between sends.

**Sub-Test B — Burst Reliability (20 rapid sends, 1 per 5 s):**

Save as `gsm_burst.sh` and run on the test laptop:
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

---

### 8.3 Sub-Test 1 — TCP Communication Across PtP Bridge

**Tool:** iperf3, ping, mtr

**Procedure:**

1. Verify end-to-end IP reachability from the LAN B Android device to the LAN A server:
   ```bash
   ping -c 10 192.168.1.10
   ```
2. Run a 2-minute sustained TCP throughput test:
   ```bash
   iperf3 -c 192.168.1.10 -t 120 -i 10 --json -o s2_tcp_run1.json
   ```
3. Record per-hop RTT and loss including both dish hops:
   ```bash
   mtr --report --report-cycles 100 192.168.1.10
   ```
4. If accessible, read RSSI and current link rate from Dish A and Dish B management interfaces and record in the result table.
5. Run the bridge stability test — continuous ping for 10 minutes:
   ```bash
   ping -i 1 -c 600 192.168.1.10 | tee s2_stability.txt
   ```
   Log any RTT values exceeding 3× the mean and any packet loss events.
6. Repeat iperf3 and ping tests 3 times. Record averages.

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
- Device A (physical Android, LAN A): TCP server mode; port dynamically assigned — discover via ADB
- Device B (physical Android or simulation laptop, LAN B): TCP client connecting to Device A's LAN A IP

**Procedure:**
0. Discover Device A's LAN A IP and TCP server port:
   ```bash
   TCP_PORT=$(adb -s <DEVICE_A_SERIAL> shell ss -tlnp \
     | awk '/tcp.*LISTEN/{print $4}' | grep -oE '[0-9]+$' | tail -1)
   DEVICE_A_IP=$(adb -s <DEVICE_A_SERIAL> shell ip -4 addr show wlan0 \
     | awk '/inet /{gsub(/\/.*/, "", $2); print $2}')
   echo "Device A (LAN A): $DEVICE_A_IP : $TCP_PORT"
   ```
1. Verify cross-LAN reachability from LAN B:
   ```bash
   ping -c 5 $DEVICE_A_IP      # from LAN B device or laptop
   ```
2. Run 120-message echo test from LAN B client to LAN A server:
   ```bash
   python3 sim_tcp_client.py $DEVICE_A_IP $TCP_PORT 1 60
   ```
3. Record connection establishment time, per-message RTT, max RTT, jitter, success rate, disconnection count, and reconnection time if a drop occurs.
4. Repeat 3 times. Compute deltas vs. §7.3b single-LAN average.

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

1. From an Android device on LAN B, send 50 sequential HTTP requests to the LAN A server:
   ```bash
   for i in $(seq 1 50); do
     curl -o /dev/null -s -w "%{time_total}\n" http://192.168.1.10/api/endpoint
   done
   ```
2. Calculate avg, P95, P99 response times and success rate.
3. Compute the delta relative to Scenario 1 averages.
4. Repeat the full 50-request sequence 3 times.

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

1. Establish a WebSocket connection from the LAN B Android device to the LAN A server:
   ```
   ws://192.168.1.10:<port>
   ```
2. Send a timestamped message every 500 ms for **5 minutes** (600 total messages per run). The extended duration is used to detect connection instability that would not appear in short tests.
3. Compute per-message RTT as in Scenario 1 §7.5.
4. Record any disconnections; if disconnection occurs, record the time to re-establish the connection.
5. Repeat 3 times.

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

1. From the LAN B Android device, trigger the mDNS service discovery function targeting the service advertised on LAN A.
2. Start packet captures simultaneously on both the LAN A and LAN B interfaces:
   ```bash
   sudo tshark -i <LAN-A-interface> -f "udp port 5353" -w s2_mdns_lana.pcapng &
   sudo tshark -i <LAN-B-interface> -f "udp port 5353" -w s2_mdns_lanb.pcapng &
   ```
3. Attempt discovery 10 times. Record success or failure and latency where applicable.
4. Note the router configuration: if no mDNS proxy is configured, document the failed discovery as an expected architectural outcome. If a proxy is configured, record discovery latency as in Scenario 1 §7.6.

**Why mDNS fails across LANs:**

```
  LAN A (192.168.1.0/24)              LAN B (192.168.2.0/24)
  ┌──────────────────────┐            ┌──────────────────────┐
  │                      │            │                      │
  │  [Backend Server]    │            │  [Android Device]    │
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

**Metrics Collected:** Discovery result (success/fail), discovery latency (ms) if applicable, proxy configuration status

**Repetitions:** 10 attempts

**Result Table 8.6 — mDNS Propagation Across LANs**

| Attempt | Result | Discovery Latency (ms) | Router mDNS Proxy | Notes |
|---|---|---|---|---|
| 1 | — | — | Yes / No | — |
| 2 | — | — | Yes / No | — |
| 3 | — | — | Yes / No | — |
| 4 | — | — | Yes / No | — |
| 5 | — | — | Yes / No | — |
| 6 | — | — | Yes / No | — |
| 7 | — | — | Yes / No | — |
| 8 | — | — | Yes / No | — |
| 9 | — | — | Yes / No | — |
| 10 | — | — | Yes / No | — |
| **Success Rate** | **—/10** | **—** | — | — |

*Observation:* ________________________________________________________________

---

### 8.7 Sub-Test 5 — GSM Modem Integration (Across PtP)

**Tool:** `curl`, `gsm_burst.sh`, test GSM handset

**Purpose:** Evaluate whether GSM delivery latency changes when the server is handling active inter-LAN traffic across the PtP backhaul, and whether triggering the send from LAN B (across the link) adds API call overhead. Compare against §7.7 baseline. Delivery path: LAN B device → API call over PtP → Backend Server (LAN A) → GSM Modem → SMS recipient.

**Procedure:**

**Sub-Test A — GSM Send Triggered from LAN B, No Background Load (10 sends):**

1. From a LAN B device or laptop, trigger server GSM sends via the cross-LAN API:
   ```bash
   curl -s -w "\nHTTP %{http_code}  dispatch %{time_total}s\n" \
        -X POST http://192.168.1.10:8000/api/gsm/send \
        -H "Content-Type: application/json" \
        -d '{"to": "<TEST_HANDSET_NUMBER>", "message": "S2-A-1"}'
   ```
2. Record server-side send timestamp (server log) and SMS arrival on test handset.
3. Repeat 10 times with ≥ 30 s between sends. Compute delta vs. §7.7a average.

**Sub-Test B — GSM Send While PtP Traffic Is Active (10 sends):**

1. Start a sustained iperf3 stream to generate background PtP load:
   ```bash
   iperf3 -c 192.168.1.10 -t 300 --json -o s2_gsm_bg_load.json &
   BG_PID=$!
   ```
2. While iperf3 is running, send 10 GSM messages (same `curl` command as Sub-Test A, change message to `"S2-B-1"` through `"S2-B-10"`).
3. Record delivery latency. Compare vs. Sub-Test A.
4. Stop background load after all 10 sends:
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

---

### 9.3 Device Simulation Strategy

Only 2–3 physical Android devices are available. Simulated clients running on a test laptop connected to the same LAN fill the remaining node slots at each step. Physical devices are retained as live clients to observe real application-layer behavior (WebSocket reconnect, mDNS discovery, GSM messaging) that simulators cannot reproduce.

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

const API_BASE = 'http://192.168.1.10:8000';
const WS_URL   = 'ws://192.168.1.10:8000/ws';

export default function () {
  // --- REST API call ---
  // Mimics the app's periodic health-check / data polling (1 request per iteration).
  // k6 automatically records response time histograms — visible in the summary output.
  const res = http.get(`${API_BASE}/api/health`, { timeout: '5s' });
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
  websocat -n --text "ws://192.168.1.10:8000/ws" \
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

1. Start with 1 physical Android device sending 20 HTTP GET requests to the API server.
2. Record aggregate requests/second, per-device avg response time, P99 response time, server CPU utilization, and error rate.
3. Scale up using the simulation strategy (§9.3) following the step sequence: 1 → 5 → 10 → 20 → 30.
4. At each step, hold for 3 minutes before recording final metrics.
5. Monitor and record server CPU and memory utilization during each step via the server's monitoring interface.
6. Keep 1–2 physical Android devices running the app throughout all steps; record their metrics separately as `[real]`.
7. Identify the node count at which P99 response time exceeds 2× the single-device baseline from Scenario 1.

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

1. At each node count step (1, 5, 10, 20, 30), all active clients (physical + simulated via §9.3.2) establish a WebSocket connection to the server and hold it open.
2. Each client sends 1 message per second for 3 minutes (180 messages per client per step).
3. Record the total number of active connections at the server, per-client message success rate, and average RTT (from physical device).
4. Log any refused connections, timeouts, or session drops.
5. Identify the node count at which dropped connections first occur.

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

1. With all N clients actively generating API and WebSocket load (from sub-tests 9.4 and 9.5 running concurrently), run an iperf3 test from one physical Android device:
   ```bash
   iperf3 -c 192.168.1.10 -t 60
   ```
2. Simultaneously trigger an mDNS service discovery from a second physical device. Record the discovery latency.
3. Record TCP throughput and packet loss under congestion.
4. Compare results against Scenario 1 baseline values.
5. Repeat at each node count step: 1, 5, 10, 20, 30.

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

1. At each hop count (1, 2, 3), run the standard 60-second iperf3 test, 100-ping sequence, and mtr trace:
   ```bash
   iperf3 -c 192.168.1.10 -t 60 --json -o hop<N>_run1.json
   ping -c 100 -i 0.2 192.168.1.10
   mtr --report --report-cycles 60 192.168.1.10
   ```
2. From the same position, run 50 sequential API requests and 120 WebSocket messages (as in §7.4 and §7.5).
3. Repeat 3 times per hop count; average results.

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

**Sub-Test A — Server → GSM Send (Idle Baseline):**

1. Trigger a server-originated message (via the API or direct server-side invocation) addressed to a test GSM handset number.
2. Record: send timestamp from the server log, delivery timestamp when the SMS appears on the test handset.
3. Delivery latency = delivery timestamp − send timestamp.
4. Repeat 10 times with at least 30 s between sends to avoid carrier throttling.

**Sub-Test B — Server → GSM Send Under Network Load:**

1. While simulated clients are running at the 30-node step (sub-tests 9.4 and 9.5 active), repeat the same 10 server-originated GSM sends from Sub-Test A.
2. Compare delivery latency against the idle baseline.
3. If under-load latency is significantly higher, cross-reference mtr output to determine whether congestion is on the LAN/backhaul path or carrier-side.

**Sub-Test C — GSM Burst Reliability:**

1. Trigger 20 rapid consecutive GSM sends from the server at 1 send per 5 s.
2. Count successful deliveries, duplicates, and undelivered messages.
3. This validates the modem's queue handling under burst alert conditions.

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

- **Local LAN baseline performance** was consistent across all four tested protocols (TCP, REST API, WebSocket, mDNS), with low latency, negligible packet loss, and high throughput, confirming the AP infrastructure performs adequately at single-device load.

- **PtP backhaul overhead** was measurable across all protocols in Scenario 2. TCP throughput decreased relative to the local baseline, and application-layer latency (API response time, WebSocket RTT) increased by a margin proportional to the link's round-trip propagation delay.

- **WebSocket connection stability** across the 30 KM PtP link was evaluated over an extended duration. Long-lived connections are more sensitive to link-quality fluctuations than stateless protocols; any disconnections observed should be addressed through application-level reconnection logic.

- **mDNS cross-LAN behavior** is constrained by protocol design: the link-local multicast TTL prevents mDNS packets from crossing IP router boundaries. Discovery failure in Scenario 2 without a proxy is expected and correct. Deployments requiring cross-LAN service discovery must implement an mDNS proxy or unicast DNS-SD alternative.

- **API server scalability** showed that response time and server resource utilization increased as the number of concurrent Android devices grew. The node count at which degradation first appeared identifies the practical upper bound for the current backend configuration.

- **WebSocket concurrent connections** consume persistent server resources. The maximum observed stable connection count before drops occurred is the practical WebSocket concurrency limit under the tested server configuration.

- **TCP throughput degradation under congestion** (Scenario 3) indicates that shared AP bandwidth and router forwarding capacity are finite. As node count increases, per-node throughput decreases; the rate of decrease indicates whether the bottleneck is the wireless medium (AP) or the forwarding path (router / PtP backhaul).

- **mDNS discovery latency under load** increased as background traffic from concurrent devices consumed shared channel capacity, confirming that mDNS—a best-effort multicast protocol—is susceptible to congestion on the wireless medium.

- **TCP P2P (app-level transport)** was validated in both single-LAN (§7.3b) and cross-PtP (§8.3c) configurations. The RTT delta between scenarios quantifies the PtP propagation overhead on direct device-to-device connections, independent of the backend server. Any disconnections observed in the cross-PtP test confirm the necessity of the app's built-in reconnection logic for P2P TCP links over unreliable long-range wireless paths.

- **GSM modem delivery** was characterized across three conditions: single-LAN idle (§7.7), cross-LAN idle (§8.7 Sub-A), and cross-LAN under PtP load (§8.7 Sub-B). GSM delivery latency is primarily carrier-determined; however, if Sub-B latency significantly exceeds Sub-A, the modem's IP path to the backend server is competing for backhaul bandwidth and may require isolation or bandwidth reservation in production.

- **Mesh hop degradation** was measurable for each additional relay hop between the Android device and the backhaul-connected AP. Both throughput and latency changed per hop; the rate of degradation indicates whether the mesh inter-AP links are the bottleneck or whether the AP-to-server path dominates.

- **GSM modem delivery** via the server-side dispatch path was evaluated under idle and under-load conditions. Because GSM delivery latency is primarily determined by the cellular carrier, any significant increase correlated with LAN congestion steps indicates the modem's network path to the backend server is contending for backhaul bandwidth rather than a carrier-side delay.

---

## 13. Conclusion

This report evaluated the network and application-layer performance of a distributed system comprising a 30 KM PtP wireless backhaul, multi-AP LAN segments, a managed router, Android client devices, and a backend server. Testing was conducted under three scenarios of increasing complexity: single-LAN baseline, inter-LAN operation across the PtP bridge, and scalability testing with up to 20 concurrently connected devices.

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
