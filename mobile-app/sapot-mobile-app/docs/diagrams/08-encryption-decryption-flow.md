# Encryption and Decryption Flow

SAPOT encrypts data at two points: before writing messages to the local database, and before sending data over the network. The key that protects stored messages is derived from the user's password and retrieved from the server on each login; for guest users, a temporary key is generated on the device and discarded on logout. Network traffic between peers is protected by a separate handshake that produces a one-time shared key for each connection. WebSocket signaling messages use a static key pair unique to the user's account. All encryption uses the NaCl cryptographic library.

> **To export:** Paste the Mermaid block into [mermaid.live](https://mermaid.live) and download as PNG or SVG for inclusion in the paper.

## Sub-flow A — Key Initialization on Login

```mermaid
flowchart TD
    A([Start]) --> B{Authenticated user?}

    B -->|No — guest| C[Generate a random encryption key on the device]
    C --> Z([End])

    B -->|Yes| J{Cached keys present in secure storage?}
    J -->|Yes| K[Load keys from secure storage]
    K --> Z
    J -->|No| I[Derive a key-encryption key from the user password]

    I --> L[Request the wrapped key bundle from the server]
    L --> M{Bundle found on server?}

    M -->|No — first login| N[Generate a new pair of encryption keys]
    N --> O[Wrap the key bundle with the password-derived key]
    O --> P[Upload wrapped bundle to server]
    P --> Q[Cache keys to device storage]
    Q --> Z

    M -->|Yes| R[Unwrap bundle using the password-derived key]
    R --> S{Unwrap successful?}
    S -->|No| T[Reject login — wrong password]
    T --> Z
    S -->|Yes| Q
```

## Sub-flow B — Message Encryption (Write to Database)

```mermaid
flowchart TD
    A([Start]) --> B[User sends a message]
    B --> C{Encryption key available for this conversation?}
    C -->|No| D[Reject write — key not yet derived]
    D --> Z([End])
    C -->|Yes| E[Generate a random nonce]
    E --> F[Encrypt message content using master key and nonce]
    F --> G[Prepend version tag to ciphertext]
    G --> H[Write encrypted string to local database]
    H --> Z
```

## Sub-flow C — Message Decryption (Read from Database)

```mermaid
flowchart TD
    A([Start]) --> B[Read message record from local database]
    B --> C{Content starts with version tag?}
    C -->|No — legacy plaintext| D[Return content as-is]
    D --> Z([End])
    C -->|Yes| E[Split nonce and ciphertext from stored string]
    E --> F[Decrypt using master key and extracted nonce]
    F --> G{Decryption successful?}
    G -->|No| H[Return decryption error — possible data corruption]
    H --> Z
    G -->|Yes| I[Return plaintext message content]
    I --> Z
```

## Sub-flow D — TCP Connection Encryption (Per-Connection Handshake)

```mermaid
flowchart TD
    A([Start]) --> B[Initiating device generates a temporary key pair]
    B --> C[Send public key to peer as handshake-init frame]
    C --> D[Receiving device generates its own temporary key pair]
    D --> E[Receiving device computes shared key from initiator public key]
    E --> F[Send own public key back as handshake-ack frame]
    F --> G[Initiating device computes shared key from responder public key]
    G --> H[Both devices now hold the same shared key]

    H --> I[Sending: generate random nonce]
    I --> J[Encrypt message with shared key and nonce]
    J --> K[Transmit encrypted frame to peer]

    H --> L[Receiving: extract nonce and ciphertext from frame]
    L --> M[Decrypt using shared key]
    M --> N{Decryption successful?}
    N -->|No| O[Discard frame — authentication failed]
    O --> Z([End])
    N -->|Yes| P[Pass plaintext message to handler]
    P --> Z
```

## Sub-flow E — WebSocket Signaling Encryption

```mermaid
flowchart TD
    A([Start]) --> B[App prepares a signaling message for a peer]
    B --> C{Peer public key known?}
    C -->|No| D[Drop message — cannot encrypt without peer key]
    D --> Z([End])
    C -->|Yes| E[Generate random nonce]
    E --> F[Encrypt payload using own secret key and peer public key]
    F --> G[Transmit encrypted envelope to server relay]
    G --> H[Server forwards envelope to recipient peer]

    H --> I[Receiving peer looks up sender public key]
    I --> J{Sender public key known?}
    J -->|No| K[Discard envelope — cannot decrypt]
    K --> Z
    J -->|Yes| L[Decrypt envelope using own secret key and sender public key]
    L --> M{Decryption successful?}
    M -->|No| N[Discard envelope — authentication failed]
    N --> Z
    M -->|Yes| O[Pass plaintext signaling payload to handler]
    O --> Z
```
