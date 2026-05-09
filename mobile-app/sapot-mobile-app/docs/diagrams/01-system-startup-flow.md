# System Startup and Authentication Flow

On launch, the SAPOT mobile application checks for a previously stored authentication session in local secure storage. If a valid token is found, the user profile is retrieved from the server; if the token has expired, a silent refresh is requested from the server, and failure to refresh forces the user to log in again. In the absence of any authenticated session, the app checks for an existing guest session and restores it directly without contacting the server. Upon successful authentication, GPS location streaming is activated and the app synchronizes its local data with the server before navigating to the home screen. Guest sessions bypass all server communication and proceed directly to the home screen in LAN-only mode.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

```mermaid
flowchart TD
    A([Start]) --> B[Launch app]
    B --> C[Load assets and splash screen]
    C --> D{Stored session found?}

    D -->|No| E{Guest session exists?}
    E -->|Yes| F[Restore guest session]
    E -->|No| G[Display login screen]
    G --> H[User enters credentials]
    H --> I[Authenticate with server]
    I --> J{Login successful?}
    J -->|No| K[Display error message]
    K --> G
    J -->|Yes| L[Save access and refresh tokens]
    L --> P

    D -->|Yes| M[Validate stored token]
    M --> N{Token valid?}
    N -->|Yes| P[Fetch user profile from server]
    N -->|No| O[Request token refresh from server]
    O --> Q{Refresh successful?}
    Q -->|Yes| R[Save new tokens]
    R --> P
    Q -->|No| S[Clear stored tokens]
    S --> G

    F --> W[Initialize app services]

    P --> U[Activate GPS streaming]
    U --> W

    W --> T{Authenticated user?}
    T -->|Yes| X[Save connection config to secure storage]
    X --> Y[Sync data with server]
    Y --> Z[Navigate to home screen]
    T -->|No| Z

    Z --> AA([End])
```
