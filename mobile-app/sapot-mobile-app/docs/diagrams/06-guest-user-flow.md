# Guest User Flow

Guest users access SAPOT without an account by providing only a first and last name; the app generates a username and a unique local identifier, storing the guest session entirely on the device without contacting the server. For the duration of the session, all communication is restricted to direct TCP connections between devices over the local area network via the router — server relay and peer-to-peer media channels are not available. On logout, all locally stored messages, conversations, and session data are permanently deleted from the device with no option for recovery. Should the guest elect to create a full account, the registration request is submitted to the server using the guest's existing local identifier as the assigned user ID, ensuring that all previously stored local data is automatically associated with the new account upon synchronization.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

## Sub-flow A — Guest Login

```mermaid
flowchart TD
    A([Start]) --> B[User selects LAN Login]
    B --> C[Enter first name and last name]
    C --> D{Input valid?}
    D -->|No| E[Display validation error]
    E --> C
    D -->|Yes| F[Generate guest username]
    F --> G[Create guest record in local database]
    G --> H[Set app mode to LAN]
    H --> I[Navigate to home screen]
    I --> Z([End])
```

## Sub-flow B — Guest TCP Messaging

> Guest sessions use TCP only. WebRTC data channels, server relay, and server sync are not available.

```mermaid
flowchart TD
    A([Start]) --> B[Guest composes message]
    B --> C[Guest taps Send]
    C --> D{Peer visible on local network?}

    D -->|Yes| E[Connect to peer via TCP]
    E --> F{TCP connection successful?}
    F -->|Yes| G[Send message via TCP]
    G --> H[Peer receives message]
    H --> I[Peer sends delivery acknowledgment]
    I --> J[Mark message as delivered]
    J --> Z([End])

    F -->|No| K[Queue message for retry]
    D -->|No| K

    K --> L[Wait for peer to come online]
    L --> M[Detect peer on network]
    M --> N[Retry queued messages via TCP]
    N --> Z
```

## Sub-flow C — Guest Logout (Full Data Wipeout)

> All local data is permanently deleted. This action cannot be undone.

```mermaid
flowchart TD
    A([Start]) --> B[User taps Logout]
    B --> C[Delete guest_user record]
    C --> D[Wipe all local messages]
    D --> E[Wipe all conversations and participants]
    E --> F[Clear stored UUID from secure storage]
    F --> G[Navigate to login screen]
    G --> Z([End])
```

## Sub-flow D — Guest Account Migration

> The guest UUID is submitted as the desired server user ID. All local records are preserved with no re-mapping required.

```mermaid
flowchart TD
    A([Start]) --> B[User opens Settings]
    B --> C[User taps Authenticate]
    C --> D[Display registration form]
    D --> E[Enter first name, last name, username, password]
    E --> F{Input valid?}
    F -->|No| G[Display field errors]
    G --> E
    F -->|Yes| H[Send registration request to server]
    H --> I[Include guest UUID as the requested user ID]
    I --> J{Registration successful?}
    J -->|No| K[Display error message]
    K --> E
    J -->|Yes| L[Save access and refresh tokens]
    L --> M[Delete guest_user record]
    M --> N[Sync local data to server]
    N --> O[Update auth state to authenticated]
    O --> P[Navigate to home as full user]
    P --> Z([End])
```

