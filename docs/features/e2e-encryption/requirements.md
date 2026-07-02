# E2E Encryption — Requirements

## Overview

All messages and direct data exchanged between peers are end-to-end encrypted using NaCl box (ECDH key exchange + XSalsa20-Poly1305). The server never has access to plaintext message content.

---

## User stories

- As a user, my messages are encrypted on my device before being sent so that the server cannot read them.
- As a user, I can send encrypted messages to peers over both the WebSocket relay and the direct LAN TCP channel.
- As a user, my encryption keys are protected by my password so that losing the device does not expose past messages.
- As a user, I can recover my encryption keys using any of my registered recovery methods if I lose access to my device.
- As a user, my public key is published to the server so that other users can encrypt messages addressed to me.
- As a system, the server signs peer public keys so that clients can detect tampering with the key registry.

---

## Functional requirements

### Key generation

- On first login, the app generates a Curve25519 ECDH key pair (PeerKey): public key and private key.
- The private key is never transmitted to the server in plaintext.
- The public key is registered with the server via `POST /keys/register`.

### Key storage (at rest)

- The private key is wrapped (encrypted) with a DeviceKey derived from the user's password (Argon2 + key derivation).
- The wrapped private key is stored server-side as `WrappedKey` (`POST /users/wrapped-key`).
- The DeviceKey is never stored — re-derived at login from the user's password.

### Key recovery

- A copy of the WrappedKey encrypted under each recovery method is stored as `WrappedKeyRecovery`.
- Recovery methods: email OTP, phone OTP, security question, recovery key file.
- On recovery, the user obtains the appropriate `WrappedKeyRecovery` copy and decrypts it using the recovery credential.

### Message encryption

- Sender looks up the recipient's Curve25519 public key via `GET /keys/<peer_id>`.
- Sender verifies the server's Ed25519 signature on the public key (`signed_credential`).
- Sender encrypts the message using NaCl box (ECDH shared secret + XSalsa20-Poly1305).
- Encrypted ciphertext is stored in `message.content` and synced to the server.

### Contact key caching

- After first contact, the peer's public key is cached locally as `ContactKey` to avoid repeated server lookups.

---

## Constraints

- The server must never receive or store plaintext message content.
- Key derivation must use Argon2 with sufficient parameters to resist brute-force.
- The server's Ed25519 signing key (`SERVER_ED25519_SEED`) must be set — if unset, key signing is disabled.
- Encryption applies to both WebSocket-relayed and LAN TCP direct messages.
