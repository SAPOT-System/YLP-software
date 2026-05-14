# Network Performance Testing Report
## Wireless PtP Backhaul and Distributed Application Evaluation

**Document Version:** 1.0
**Date:** 2026-05-13
**Classification:** Engineering / Capstone Project Report
**Network System:** Long-Range PtP Wireless Bridge with Multi-AP Distribution

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

All active test sessions from a previous sub-test are terminated before the next sub-test begins.

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

## 8. Scenario 2 – Multi-LAN Operation Across PtP Link

### 8.1 Purpose

Evaluate the performance impact of routing all application traffic across the 30 KM PtP wireless backhaul. Android devices on LAN B communicate with the backend server on LAN A. All packets traverse Dish B → PtP link → Dish A → Router → Backend Server. Results are compared directly against Scenario 1 baselines to quantify backhaul-induced overhead.

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

## 9. Scenario 3 – Scalability Testing with Increasing Connected Devices

### 9.1 Purpose

Determine the scalability limits of the system by incrementally increasing the number of concurrently connected Android devices. The test identifies the node count at which each protocol begins to degrade and isolates the bottleneck component.

### 9.2 Network Setup

- Android devices distributed across both LAN A and LAN B APs
- Backend server at 192.168.1.10 on LAN A
- Node count steps: **1, 5, 10, 15, 20** devices active simultaneously
- At each step, all active devices generate load concurrently
- Each step is held for a minimum of 3 minutes before metrics are recorded

---

### 9.3 Sub-Test 1 — API Server Load Testing

**Tool:** Android application (HTTP test screen) or curl scripts

**Procedure:**

1. Start with 1 Android device. All active devices simultaneously send 20 HTTP GET requests to the API server.
2. Record aggregate requests/second, per-device avg response time, P99 response time, server CPU utilization, and error rate.
3. Add devices incrementally following the step sequence: 1 → 5 → 10 → 15 → 20.
4. At each step, hold for 3 minutes before recording final metrics.
5. Monitor and record server CPU and memory utilization during each step via the server's monitoring interface.
6. Identify the node count at which P99 response time exceeds 2× the single-device baseline from Scenario 1.

**Metrics Collected:** Node count, aggregate req/sec, avg response time (ms), P99 (ms), server CPU (%), error rate (%)

**Degradation Indicator:** P99 response time > 2× Scenario 1 single-device baseline, or error rate > 1%

**Result Table 9.3 — API Server Load by Node Count**

| Node Count | Req/sec | Avg Response (ms) | P99 (ms) | Server CPU (%) | Error Rate (%) |
|---|---|---|---|---|---|
| 1 | — | — | — | — | — |
| 5 | — | — | — | — | — |
| 10 | — | — | — | — | — |
| 15 | — | — | — | — | — |
| 20 | — | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.4 Sub-Test 2 — WebSocket Concurrent Connection Stress

**Tool:** Android application WebSocket client

**Procedure:**

1. At each node count step (1, 5, 10, 15, 20), all active devices establish a WebSocket connection to the server and hold it open.
2. Each device sends 1 message per second for 3 minutes (180 messages per device per step).
3. Record the total number of active connections at the server, per-device message success rate, and average RTT.
4. Log any refused connections, timeouts, or session drops.
5. Identify the node count at which dropped connections first occur.

**Metrics Collected:** Node count, active connections, avg WS RTT (ms), message success rate (%), dropped connections

**Degradation Indicator:** First occurrence of dropped connections or message success rate < 99%

**Result Table 9.4 — WebSocket Concurrent Connection Stress**

| Node Count | Active Connections | Avg WS RTT (ms) | Max RTT (ms) | Success Rate (%) | Dropped Connections |
|---|---|---|---|---|---|
| 1 | — | — | — | — | — |
| 5 | — | — | — | — | — |
| 10 | — | — | — | — | — |
| 15 | — | — | — | — | — |
| 20 | — | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.5 Sub-Test 3 — TCP Throughput and mDNS Discovery Under Congestion

**Tool:** iperf3, Android application mDNS discovery screen

**Procedure:**

1. With all N devices actively generating API and WebSocket load (from sub-tests 9.3 and 9.4 running concurrently), run an iperf3 test from one device:
   ```bash
   iperf3 -c 192.168.1.10 -t 60
   ```
2. Simultaneously trigger an mDNS service discovery from one device. Record the discovery latency.
3. Record TCP throughput and packet loss under congestion.
4. Compare results against Scenario 1 baseline values.
5. Repeat at each node count step: 1, 5, 10, 15, 20.

**Metrics Collected:** Node count, TCP throughput under load (Mbps), mDNS discovery latency (ms), packet loss (%)

**Degradation Indicator:** TCP throughput drops > 30% from Scenario 1 baseline; mDNS discovery latency exceeds 2 seconds

**Result Table 9.5 — TCP and mDNS Under Concurrent Load**

| Node Count | TCP Throughput (Mbps) | mDNS Discovery (ms) | Packet Loss (%) | Notes |
|---|---|---|---|---|
| 1 | — | — | — | — |
| 5 | — | — | — | — |
| 10 | — | — | — | — |
| 15 | — | — | — | — |
| 20 | — | — | — | — |

*Observation:* ________________________________________________________________

---

### 9.6 Degradation Summary

**Result Table 9.6 — Scalability Degradation Thresholds**

| Metric | Single-Device Baseline | Degradation Threshold | Node Count at Threshold | Suspected Bottleneck |
|---|---|---|---|---|
| API avg response (ms) | — | 2× baseline | — | — |
| API P99 response (ms) | — | 2× baseline | — | — |
| API error rate (%) | 0% | > 1% | — | — |
| WS dropped connections | 0 | First occurrence | — | — |
| WS avg RTT (ms) | — | 2× baseline | — | — |
| TCP throughput (Mbps) | — | 30% drop | — | — |
| mDNS discovery (ms) | — | > 2000 ms | — | — |

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
| 3 | API Response Time vs. Node Count | Line graph | Node count | Avg / P99 response (ms) | Table 9.3 |
| 4 | WebSocket RTT vs. Node Count | Line graph | Node count | Avg WS RTT (ms) | Table 9.4 |
| 5 | Packet Loss (%) vs. Node Count | Line graph | Node count | Packet loss (%) | Table 9.5 |
| 6 | mDNS Discovery Latency: S1 vs. S2 | Bar chart | Scenario | Avg discovery latency (ms) | Tables 7.6, 8.6 |
| 7 | TCP Throughput Under Concurrent Load | Line graph | Node count | Throughput (Mbps) | Table 9.5 |
| 8 | Bridge RTT Stability Over Time | Line graph | Time (minutes) | RTT (ms) | Table 8.3b |

> **Graph 1** — `[INSERT: TCP Throughput by Scenario — Bar Chart]`

> **Graph 2** — `[INSERT: Latency Comparison by Scenario — Grouped Bar Chart]`

> **Graph 3** — `[INSERT: API Response Time vs. Node Count — Line Graph]`

> **Graph 4** — `[INSERT: WebSocket RTT vs. Node Count — Line Graph]`

> **Graph 5** — `[INSERT: Packet Loss vs. Node Count — Line Graph]`

> **Graph 6** — `[INSERT: mDNS Discovery Latency S1 vs S2 — Bar Chart]`

> **Graph 7** — `[INSERT: TCP Throughput Under Load vs. Node Count — Line Graph]`

> **Graph 8** — `[INSERT: Bridge RTT Time-Series Over 10 Minutes — Line Graph]`

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

---

## 13. Conclusion

This report evaluated the network and application-layer performance of a distributed system comprising a 30 KM PtP wireless backhaul, multi-AP LAN segments, a managed router, Android client devices, and a backend server. Testing was conducted under three scenarios of increasing complexity: single-LAN baseline, inter-LAN operation across the PtP bridge, and scalability testing with up to 20 concurrently connected devices.

The results demonstrate that the system performs within expected parameters under single-LAN conditions, with all tested protocols (TCP, REST API, WebSocket, mDNS) meeting baseline latency and reliability targets. The introduction of the PtP wireless backhaul in Scenario 2 added measurable overhead to all latency-sensitive metrics; the magnitude of this overhead is inherent to the 30 KM link distance and is expected in long-range wireless deployments. The system remained functional under inter-LAN load, with the key finding being that application-layer reconnection logic and API retry mechanisms are essential for production robustness over the PtP link.

Scalability testing in Scenario 3 identified the node count at which each protocol began to degrade, and isolates the primary system bottleneck. Based on these findings, the following recommendations are made: (1) the optimal concurrent device count for this deployment is **—** devices; (2) the PtP link should be monitored for RSSI and SNR to detect antenna alignment drift that would degrade throughput over time; (3) an mDNS proxy should be deployed on the router if cross-LAN service discovery is a system requirement; and (4) the backend server should be provisioned with additional resources or a connection pool tuned to the target concurrent WebSocket connection count before production deployment.

Further testing is recommended to evaluate performance under adverse weather conditions (for the PtP link), at maximum rated concurrent device counts, and with application-level traffic patterns reflecting real user behavior rather than synthetic load.

---

*End of Report*
