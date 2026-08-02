# Data Flows

This document describes the key data flows in SAPOT. For the communication matrix see [system-overview.md](system-overview.md). For service topology see [component-map.md](component-map.md).

---

## 1. Sync flow (pull then push)

The mobile app (WatermelonDB) syncs with the server in two phases.

```mermaid
sequenceDiagram
    participant Mobile
    participant Server

    Mobile->>Server: GET /sync/pull?last_pulled_at=T
    Server-->>Mobile: { changes: {...}, timestamp: T2 }
    Mobile->>Mobile: apply changes to local DB
    Mobile->>Server: POST /sync/push { changes: {...}, last_pulled_at: T2 }
    Server-->>Mobile: { status: "ok" }
    Mobile->>Mobile: update lastPulledAt = T2
```

- Initial sync: `last_pulled_at=0` returns all non-deleted records.
- Incremental: returns only records with `updated_at > last_pulled_at`.
- Conflict: if server record `updated_at > last_pulled_at`, push returns 409.
- Message rows are pushed independently of delivery receipts, so pending or
  failed peer delivery still has a durable server-side history copy.
- `SENDING` and `NOT_SENT` receipts remain local and are kept dirty for retry;
  `SENT`, `DELIVERED`, and `READ` receipts are synced.

Tables synced: `conversations`, `messages`, `conversation_participants`, `calls`, `call_participants`, `message_receipts`.

See [api/sync.md](../api/sync.md) and [mobile-app docs SYNC.md](../../mobile-app/sapot-mobile-app/docs/SYNC.md).

---

## 2. Message delivery flow

### Path A: Peer online (WebSocket relay)

```mermaid
sequenceDiagram
    participant A as Mobile A
    participant S as Server (WS relay)
    participant B as Mobile B

    A->>S: WS {type:"msg", to:B, payload:<blob>}
    S->>B: forward to B
    B-->>S: ack
```

### Path B: Peer offline (queue + drain on reconnect)

```mermaid
sequenceDiagram
    participant A as Mobile A
    participant S as Server
    participant B as Mobile B

    A->>S: WS send msg
    Note over S: B offline: store in Queue
    B->>S: WS connect
    S->>B: drain queue
    B-->>S: ack
    S->>S: delete from queue
```

### Path C: LAN direct (mDNS discovery + TCP + WebRTC data channel)

Devices on the same WiFi network can message each other directly with no server involvement, using the `lan` transport mode. See [mobile-app docs LAN_MESSENGER.md](../../mobile-app/sapot-mobile-app/docs/LAN_MESSENGER.md) and [ARCHITECTURE.md](../../mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md) for full implementation detail.

```mermaid
sequenceDiagram
    participant A as Mobile A (DiscoveryService)
    participant Z as mDNS / Zeroconf
    participant B as Mobile B (DiscoveryService)

    A->>Z: publish self (peer id, LAN IP, port)
    B->>Z: publish self (peer id, LAN IP, port)
    A->>Z: scan for "lanchat" peers
    Z-->>A: resolve B's LAN address:port

    Note over A,B: TCP connection (signalling channel)
    A->>B: TCP connect (TcpClientAdapter)
    A->>B: WebRTC offer (relayed over TCP)
    B-->>A: WebRTC answer (relayed over TCP)
    A->>B: ICE candidates (relayed over TCP)
    B-->>A: ICE candidates (relayed over TCP)

    Note over A,B: WebRTC data channel established
    A->>B: encrypted message (data channel)
    B-->>A: delivery ack (data channel)
```

Key constraints of `lan` mode:
- No WebSocket relay is used or allowed — message send throws if no data channel is open (`"No data channel and WS not allowed in lan mode"`).
- Zeroconf publish/scan is only enabled when `effectiveMode === "lan" || "auto"`.
- On `peer-reconnected` (WebRTC data channel reopens), `DiscoveryService` triggers a retry of any message left in `NOT_SENT` status.

### SMS fallback

If the recipient cannot be reached over LAN or WS, the server relays the message as an SMS via the GSM module (serial-attached GSM modem). This is one-directional per hop (mobile → non-app recipient, and SMS reply → mobile app user), not a substitute for the encrypted transports above — SMS content is plaintext at the GSM module.

```mermaid
sequenceDiagram
    participant A as Mobile A
    participant S as Server (app/api/gsm.py)
    participant G as GSM module (GSM-fastapi)
    participant M as Modem (AT commands)
    participant C as Carrier network
    participant P as Recipient phone

    A->>S: POST /gsm/send-sms (target user has no app presence)
    S->>G: POST http://localhost:8001/sms/send (X-GSM-Secret header)
    G->>M: AT command: send SMS (serial_worker.py)
    M->>C: SMS PDU
    C->>P: SMS delivered

    Note over P,C: Inbound reply
    P->>C: SMS reply
    C->>M: SMS PDU
    M->>G: serial_worker reads modem, sms_handler.py parses
    G->>S: POST /gsm/inbound-sms (X-GSM-Secret header)
    S->>S: resolve sender/target user, create/append SMS conversation
```

The server and GSM module authenticate each other with a shared `GSM_SECRET` header (`X-GSM-Secret`), not a user session token — see [environment-config.md](../deployment/environment-config.md).

---

## 3. Call signalling flow (WebRTC)

The server relays only small SDP/ICE negotiation messages. It never carries media.

```mermaid
sequenceDiagram
    participant A as Caller (A)
    participant S as Server (WS relay)
    participant B as Callee (B)

    A->>S: WS {type:"offer", from:A, to:B, sdp}
    S->>B: forward to B
    B-->>S: {type:"answer", from:B, to:A, sdp}
    S-->>A: forward to A
    Note over A,B: ICE candidates exchanged the same way
    A<<->>B: WebRTC P2P media (server not involved)
```

See [mobile-app docs CALL_FLOW.md](../../mobile-app/sapot-mobile-app/docs/CALL_FLOW.md).

---

## 4. GPS streaming flow

```mermaid
sequenceDiagram
    participant M as Mobile (user)
    participant S as Server
    participant R as Rescuer dashboard

    M->>S: WSS /gps/ws/<id> connect
    loop each location update
        M->>S: { lat, lng }
        S->>S: save UserLocation
        S->>R: broadcast to rescuers
    end
```

REST: `GET /gps/latest` and `GET /gps/history/{user_id}` serve the initial map load and historical path.
