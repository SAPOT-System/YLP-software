# Security Implementation

```mermaid
flowchart TD
    subgraph REST["At-Rest Encryption"]
        LS["LocalEncryptionService"]
        SK["Device Key\n(generated once, stored in Keystore)"]
        MR["MessageRepository"]

        LS -->|"load or generate key"| SK
        MR -->|"encrypt on write\ndecrypt on read"| LS
    end

    subgraph TRANSIT["In-Transit Encryption (TCP)"]
        subgraph HANDSHAKE["ECDH Handshake (per connection)"]
            H1["1. Client generates ephemeral keypair"]
            H2["2. Client sends public key"]
            H3["3. Server generates ephemeral keypair"]
            H4["4. Server derives shared key via ECDH"]
            H5["5. Server sends its public key"]
            H6["6. Client derives shared key via ECDH"]
            H7["Both sides now hold the same shared key"]

            H1 --> H2 --> H3 --> H4 --> H5 --> H6 --> H7
        end

        subgraph FRAMES["Encrypted Frames"]
            F1["Send: NaCl secretbox + random nonce"]
            F2["Receive: NaCl secretbox.open"]
        end

        H7 --> FRAMES
    end

    subgraph STORAGE["Secure Key Storage"]
        SC["secure-config.ts\n(expo-secure-store)"]
        DK["DEVICE_ENCRYPTION_KEY"]
        SC --> DK
        LS -->|"read / write"| SC
    end

    subgraph SERVER["Server Hardening (FastAPI)"]
        AUTH["auth.py — OAuth2, JWT refresh tokens, password hashing"]
        MAIN["main.py — rate limiting, CORS hardening"]
    end

    REST -.->|"ciphertext stored in SQLite"| DB[("WatermelonDB")]
    TRANSIT -.->|"ciphertext over LAN socket"| NET["TCP Socket"]
    STORAGE -.->|"key persisted"| KS["Android Keystore"]
    SERVER -.->|"tokens over HTTPS"| API["REST API"]
```

## Layer Summary

| Layer | Where | Mechanism | Key Files |
|---|---|---|---|
| At-rest | WatermelonDB messages | NaCl `secretbox`, device-scoped key | `local-encryption-service.ts`, `message-repository.ts` |
| In-transit | LAN TCP connections | ECDH ephemeral handshake + NaCl `secretbox` | `tcp-encryption.ts`, `tcp-client-adapter.ts`, `tcp-server-adapter.ts` |
| Key storage | Device keystore | `expo-secure-store` → Android Keystore | `secure-config.ts` |
| Server | FastAPI backend | OAuth2 JWT, rate limiting, CORS | `auth.py`, `main.py` |
