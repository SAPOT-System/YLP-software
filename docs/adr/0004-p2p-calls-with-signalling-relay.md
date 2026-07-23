# Calls are P2P WebRTC media with a server-relayed signalling channel only

## Context

Voice/video calls need a way for two devices to discover each other's network path and exchange SDP/ICE candidates (signalling) before media can flow. The server could either relay the call media itself (a TURN-like or SFU-like architecture) or relay only the small signalling messages and let media flow directly between devices.

SAPOT's server is not provisioned as a media relay (no TURN server, no SFU) and the design principle is that the server should never be in the path for content it doesn't need to see (see [system-overview.md](../architecture/system-overview.md#design-principles)). On a LAN, direct peer connectivity is the common case since there's no NAT between devices on the same network.

## Decision

Calls use WebRTC peer-to-peer for media. The server's `/ws/` WebSocket relays only SDP offer/answer and ICE candidate messages between the two peers (`SignalingService`, `peer_connection.py`) — it never touches audio/video streams.

```mermaid
flowchart LR
    subgraph Signalling path — via server
        A1[Caller] -->|SDP offer/answer, ICE candidates| S[Server /ws/]
        S -->|relay| A2[Callee]
    end
    subgraph Media path — direct P2P, never touches server
        A1 -.->|WebRTC audio/video RTP| A2
    end
```

## Consequences

- **Server load stays low regardless of call volume or duration** — the server's cost is a handful of small signalling messages per call, not a proportional share of media bandwidth. This matters at incident-site scale where the server host may be modest hardware.
- **No TURN server means calls can fail behind restrictive NATs.** This is currently accepted because the primary deployment is a single flat LAN where devices can reach each other directly; it becomes a real limitation if SAPOT is ever deployed across networks with NAT between callers (e.g. rescuer on cellular data, civilian on the incident LAN). No TURN fallback exists today.
- **Signalling channel choice affects reachability, not privacy.** SDP/ICE messages reveal call metadata (who is calling whom, approximate network topology via ICE candidates) to the server relay, but never call content — consistent with the [E2E encryption](0001-nacl-box-for-e2e-encryption.md) tradeoff for messages.
- **This decision is coupled to** the [LAN-first design ADR](0005-lan-first-design.md): P2P-only calling is viable specifically because LAN-first deployment makes direct reachability the default case.
