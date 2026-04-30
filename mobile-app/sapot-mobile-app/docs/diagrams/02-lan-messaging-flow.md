# LAN Messaging Flow

When a user sends a message, the mobile app selects the best available transport path in descending order of priority. If a direct peer-to-peer connection between the two devices is already active, the message is transmitted immediately without server involvement. If no direct connection exists, the app attempts to reach the recipient over the local area network via the router using a direct TCP link; if the recipient is unreachable on the LAN, the message is relayed through the central server over the network, or queued locally if the server is also unavailable. Once the recipient's device comes online, queued messages are retried and upon delivery the message record is synchronized with the server.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

```mermaid
flowchart TD
    A([Start]) --> B[User composes message]
    B --> C[User taps Send]
    C --> D{Peer connection active?}

    D -->|Yes| E[Transmit via WebRTC data channel]
    E --> F[Peer receives message]
    F --> G[Peer sends delivery acknowledgment]
    G --> H[Mark message as delivered]
    H --> I[Sync data with server]
    I --> Z([End])

    D -->|No| J{Peer visible on local network?}

    J -->|Yes| K[Connect directly to peer via TCP]
    K --> L{TCP connection successful?}
    L -->|Yes| M[Send message via TCP]
    M --> N[Establish WebRTC connection]
    N --> Z

    L -->|No| O[Queue message for retry]

    J -->|No| P{Server connection available?}
    P -->|Yes| Q[Relay message via server]
    Q --> Z
    P -->|No| O

    O --> R[Wait for peer to come online]
    R --> S[Detect peer on network]
    S --> T[Retry all queued messages]
    T --> Z
```
