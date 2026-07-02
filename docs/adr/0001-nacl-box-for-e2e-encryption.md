# Use NaCl box (ECDH + XSalsa20-Poly1305) for message E2E encryption

## Context

SAPOT needs end-to-end message encryption where the server — which relays messages when the LAN P2P path is unavailable and stores synced history — must never be able to read message content. The mobile app is React Native/Expo (JavaScript runtime, no native crypto primitives available by default), and messages travel over two different transports (LAN TCP+TLS and server WebSocket relay) that must produce identical ciphertext handling regardless of path.

Candidates considered: raw libsodium bindings, the Signal Protocol (X3DH + Double Ratchet), and TweetNaCl's `box` primitive (ECDH key agreement + XSalsa20-Poly1305 AEAD).

## Decision

Use NaCl `box` via the `tweetnacl` JS library for message content, with per-conversation ECDH key pairs (`PeerKey`). Encryption happens identically regardless of transport — the mobile app encrypts once and the server only ever forwards or stores ciphertext.

## Consequences

- **Simplicity:** `tweetnacl` is a small, audited, pure-JS/pure-C library with no native module dependency — it runs the same on the mobile app and would run identically in the admin frontend or server if ever needed. This avoided a native-binding integration risk that raw libsodium or platform Keychain-backed crypto would have introduced.
- **Transport independence:** Because encryption happens above the transport layer, the LAN TCP+TLS path and the WS relay path share one encryption implementation — see [message encryption flow](../architecture/security-architecture.md#message-encryption-nacl-box-transport-agnostic).
- **Constraint accepted:** NaCl box does not provide forward secrecy across the life of a conversation the way Signal's Double Ratchet does — a single compromised long-lived `PeerKey` private key can decrypt all past and future messages encrypted to it (within the key's expiry window). This tradeoff was accepted because implementing the Double Ratchet's per-message ratcheting state machine, plus X3DH's pre-key bundle infrastructure, was judged too complex for the deployment timeline and doesn't fit the LAN-first model where a peer may not always be reachable to negotiate ratchet state.
- **No key transparency:** without a Signal-style safety-number/QR verification UI, users cannot independently verify a peer's public key out of band. See [threat-model.md](../architecture/threat-model.md#e2e-encryption-design-risks) for the resulting MITM risk if server-side key signing (`SERVER_ED25519_SEED`) is left unconfigured.
