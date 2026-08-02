# Voice and Video Call Flow

A voice or video call is initiated when the caller's device sends a call request to the recipient through the network; if the recipient does not respond within the timeout window or declines, the call is recorded as missed or declined respectively. Upon acceptance, both devices exchange signaling messages through the network to negotiate a direct peer-to-peer media connection. Once established, audio and video stream directly between the two devices without passing through the central server. On call termination, the call duration is recorded and the call log is synchronized with the server.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

```mermaid
flowchart TD
    A([Start]) --> B[Caller selects contact]
    B --> C[Caller taps Call]
    C --> D[Create call record and call ID]
    D --> E[Prepare WS or TCP and send call request - no WebRTC]
    E --> F[Display outgoing call screen]
    F --> G{Callee responds?}

    G -->|No - timeout| H[Send missed-call notification]
    H --> I[Record call as missed]
    I --> Z([End])

    G -->|Yes| J{Callee accepts?}
    J -->|No| K[Callee sends rejection]
    K --> L[Record call as declined]
    L --> Z

    J -->|Yes| M[Callee sends ready signal with matching call ID]
    M --> N[Caller validates call ID and begins WebRTC negotiation]
    N --> O[Exchange network information]
    O --> P{Connection established?}

    P -->|No| Q[Display connection error]
    Q --> Z

    P -->|Yes| R[Stream audio and video between devices]
    R --> S[Display in-call screen]
    S --> T{User ends call?}
    T -->|No| S
    T -->|Yes| U[Send call-ended signal to peer]
    U --> V[Stop media streams]
    V --> W[Record call duration]
    W --> X[Save call log to conversation]
    X --> Y[Sync data with server]
    Y --> Z
```
