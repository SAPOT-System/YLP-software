# crypto-architecture

## Description

Architecture reference for the Sapot encryption and key management subsystem. The app implements end-to-end NaCl box encryption (`tweetnacl`) over both TCP and WebSocket transports, plus at-rest encryption of local data. This skill maps every file in the crypto layer so you know what exists before writing anything new.

## Usage

Invoke this skill when:
- Adding or modifying anything that touches encryption, key derivation, or secure storage of keys
- Deciding which file to extend vs. create for a crypto-related change
- Debugging an `EncryptedEnvelope`, a `SignedCredential`, or a `WrappedBlob`
- Choosing which library to use for a crypto operation

## File Map

All files live in `features/shared/services/` unless noted otherwise.

### Transport Encryption

| File | Responsibility |
|---|---|
| `tcp-encryption.ts` | Wraps and unwraps `EncryptedEnvelope` messages on the direct TCP channel. Touch this when changing how messages are encrypted/decrypted over the LAN connection. |
| `ws-encryption.ts` | Encrypts signaling and credential payloads relayed through the server WebSocket so the relay server cannot read them. Touch this when changing WS-relayed message confidentiality. |

### At-Rest Encryption

| File | Responsibility |
|---|---|
| `local-encryption-service.ts` | Owns at-rest encryption of local data. Holds the master key and the signaling secret key. Keys are persisted via `key-derivation.ts`. Touch this when changing what local data is encrypted or how the master key is used. |

### Key Management

| File | Responsibility |
|---|---|
| `peer-key-service.ts` | Fetches, signs, and verifies peer public keys. Produces and consumes `SignedCredential`. The service layer — call this to interact with peer keys. |
| `peer-key-store.ts` | Caches verified peer public keys in memory. The storage layer for `peer-key-service.ts`. |
| `key-recovery-service.ts` | Wraps the master key under multiple recovery methods: `password`, `phone`, `email`, `qa`, `token`. Produces a `WrappedBlob`. Touch this when adding or modifying key recovery options. |
| `key-derivation.ts` | KDF implementation and `expo-secure-store` accessors for the master key and signaling key. The lowest-level crypto primitive file. Touch this only when changing how keys are derived or where they are stored. |

### Crypto Stack

Do not substitute these libraries without an explicit architectural decision.

| Library | Role |
|---|---|
| `tweetnacl` + `tweetnacl-util` | NaCl box (X25519 + XSalsa20-Poly1305) for E2E encryption |
| `@noble/hashes` | SHA-2, HKDF — key derivation primitives |
| `expo-crypto` | Platform-native random bytes |
| `react-native-quick-crypto` | Fast native crypto for React Native (supplements tweetnacl) |

## Decision Rules

- **New transport-level encryption** → extend `tcp-encryption.ts` or `ws-encryption.ts`; do not introduce a third transport encryption file.
- **New at-rest encrypted field** → route through `local-encryption-service.ts`.
- **Interacting with a peer's public key** → use `peer-key-service.ts`, not `peer-key-store.ts` directly.
- **New KDF or secure-store key** → add to `key-derivation.ts`.
- **New recovery method** → extend `key-recovery-service.ts`.
- **Never use `AsyncStorage` for keys** — always `expo-secure-store` via `key-derivation.ts` accessors.

## Expected Output

When asked to add a feature that encrypts data over TCP:
→ Point to `tcp-encryption.ts`, explain what `EncryptedEnvelope` looks like, and show which function to extend.

When asked which library to use for hashing:
→ `@noble/hashes` — already a dependency, do not add a new hash library.

When asked to implement a new recovery method:
→ Point to `key-recovery-service.ts`, describe the `WrappedBlob` output type, and show the pattern used by existing methods.
