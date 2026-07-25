# E2E Encryption — Requirements

## Overview

All messages and direct data exchanged between peers are E2E encrypted using NaCl box (ECDH key exchange + XSalsa20-Poly1305). The server never has access to plaintext message content.

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|----------|
| EE-01 | user | have my messages encrypted on my device before being sent | the server cannot read them |
| EE-02 | user | send encrypted messages to peers over both the WebSocket relay and the direct LAN TCP channel | encryption is consistent regardless of transport |
| EE-03 | user | have my encryption keys protected by my password | losing the device does not expose past messages |
| EE-04 | user | recover my encryption keys using any of my registered recovery methods | I don't lose message history if I lose access to my device |
| EE-05 | user | have my public key published to the server | other users can encrypt messages addressed to me |
| EE-06 | system | sign peer public keys | clients can detect tampering with the key registry |

---

## Functional Requirements

### FR-EE-01 — Key generation

- On first login, the app generates a Curve25519 ECDH key pair (PeerKey): public key and private key.
- The private key is never transmitted to the server in plaintext.
- The public key is registered with the server via `POST /keys/register`.

### FR-EE-02 — Key storage (at rest)

- The private key is wrapped (encrypted) with a DeviceKey derived from the user's password (Argon2 + key derivation).
- The wrapped private key is stored server-side as `WrappedKey` (`POST /users/wrapped-key`).
- The DeviceKey is never stored — re-derived at login from the user's password.

### FR-EE-03 — Key recovery

- A copy of the WrappedKey encrypted under each recovery method is stored as `WrappedKeyRecovery`.
- Recovery methods: email OTP, phone OTP, security question, recovery key file.
- On recovery, the user obtains the appropriate `WrappedKeyRecovery` copy and decrypts it using the recovery credential.

### FR-EE-04 — Message encryption

- Sender looks up the recipient's Curve25519 public key via `GET /keys/<peer_id>`.
- Sender verifies the server's Ed25519 signature on the public key (`signed_credential`).
- Sender encrypts the message using NaCl box (ECDH shared secret + XSalsa20-Poly1305).
- Encrypted ciphertext is stored in `message.content` and synced to the server.

### FR-EE-05 — Contact key caching

- After first contact, the peer's public key is cached locally as `ContactKey` to avoid repeated server lookups.

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-EE-01 | The server must never receive or store plaintext message content |
| NFR-EE-02 | Key derivation must use Argon2 with sufficient parameters to resist brute-force |
| NFR-EE-03 | The server's Ed25519 signing key (`SERVER_ED25519_SEED`) must be set — if unset, key signing is disabled |
| NFR-EE-04 | Encryption applies to both WebSocket-relayed and LAN TCP direct messages |

---

## Out of Scope

See [design.md#non-goals](design.md#non-goals) for what this feature explicitly does not cover.
