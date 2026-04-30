# GPS Location Sharing Flow

GPS location sharing in SAPOT operates through two complementary sub-flows for authenticated users. In the streaming sub-flow, the mobile app opens a dedicated connection to the server and continuously forwards the device's GPS coordinates whenever the position changes; if the connection is lost, the app reconnects automatically every three seconds. Streaming requires both the user's sharing preference to be enabled and the device's location permission to be granted by the operating system. In the viewing sub-flow, the map screen polls the server every five seconds for the latest positions of all sharing users and renders them as markers on the map, stopping when the user navigates away.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

## Sub-flow A — Streaming Location (Authenticated User)

```mermaid
flowchart TD
    A([Start]) --> B[Authenticated user logs in]
    B --> C{Location sharing enabled?}
    C -->|No| Z([End])
    C -->|Yes| D{Location permission granted?}

    D -->|No| E[Request location permission]
    E --> F{Permission granted?}
    F -->|No| G[Display permission error]
    G --> Z
    F -->|Yes| H[Open GPS connection to server]

    D -->|Yes| H

    H --> I{Connection successful?}
    I -->|No| J[Wait 3 seconds]
    J --> H
    I -->|Yes| K[Begin watching device location]

    K --> L{Location changed?}
    L -->|No| K
    L -->|Yes| M{Connection open?}
    M -->|Yes| N[Send coordinates to server]
    M -->|No| O[Wait for reconnect]
    O --> P{Sharing disabled or logged out?}
    N --> P

    P -->|No| K
    P -->|Yes| Q[Stop location watcher]
    Q --> R[Close GPS connection]
    R --> Z
```

## Sub-flow B — Viewing the Map (Authenticated User / Admin)

```mermaid
flowchart TD
    A([Start]) --> B[Open GPS map screen]
    B --> C[Request latest locations from server]
    C --> D{Response received?}
    D -->|Yes| E[Render user markers on map]
    D -->|No| F[Show last known positions]
    E --> G[Wait 5 seconds]
    F --> G
    G --> H{User leaves map screen?}
    H -->|No| C
    H -->|Yes| I[Stop polling]
    I --> Z([End])
```
