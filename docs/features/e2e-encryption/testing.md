# E2E Encryption — Testing

## Test strategy

Encryption tests verify cryptographic correctness of key generation, message encryption/decryption, key wrapping, and transport-layer encryption. These are primarily unit tests on the crypto service layer and do not require a running server.

---

## Unit tests — crypto services

### Key generation (`peer-key-service.ts`)

| Scenario | Expected result |
|---|---|
| Generate key pair | Returns `{ publicKey: Uint8Array(32), secretKey: Uint8Array(32) }` |
| Two calls produce different key pairs | Public keys are not equal |
| Public key length | Exactly 32 bytes (Curve25519) |

### Key derivation (`key-derivation.ts`)

| Scenario | Expected result |
|---|---|
| Same password + same salt → same DeviceKey | Keys are equal |
| Different password → different DeviceKey | Keys are not equal |
| Different salt → different DeviceKey | Keys are not equal |

### Key wrapping / unwrapping (`local-encryption-service.ts`)

| Scenario | Expected result |
|---|---|
| Wrap private key with DeviceKey | Returns ciphertext + nonce |
| Unwrap with same DeviceKey | Returns original private key |
| Unwrap with wrong DeviceKey | Returns null or throws |
| Wrapped blob differs from plaintext key | `wrappedKey !== secretKey` |

### Message encryption (`tcp-encryption.ts`, `ws-encryption.ts`)

| Scenario | Expected result |
|---|---|
| Encrypt with Alice's private + Bob's public | Ciphertext ≠ plaintext |
| Decrypt with Bob's private + Alice's public | Returns original plaintext |
| Decrypt with wrong key pair | Returns null |
| Same plaintext encrypted twice | Different ciphertexts (random nonce) |
| Tampered ciphertext | Decryption returns null |

---

## Integration tests — key registration and lookup

| Scenario | Expected result |
|---|---|
| `POST /keys/register` with valid public key | 200, `signed_credential` returned |
| `GET /keys/<peer_id>` after registration | 200, returns registered public key |
| `GET /keys/<peer_id>` for unknown peer | 404 Not Found |
| `SERVER_ED25519_SEED` set | `signed_credential` is a valid Ed25519 signature |
| `SERVER_ED25519_SEED` unset | `signed_credential` is null or absent |

---

## Key recovery round-trip tests

| Scenario | Expected result |
|---|---|
| Wrap WrappedKey under recovery credential | Produces distinct ciphertext |
| Unwrap with correct recovery credential | Returns original WrappedKey |
| Unwrap with wrong recovery credential | Returns null |
| Full round-trip: wrap → store → retrieve → unwrap | Original private key recovered |

---

## Coverage targets

- Key generation: 100% branch coverage.
- Encrypt/decrypt: happy path, wrong key, tampered ciphertext — all branches covered.
- Key derivation: same-input determinism and different-input divergence verified.
- No test may log or assert on real private key material.

---

## Test conventions

- Use `tweetnacl.box.keyPair()` to generate synthetic key pairs in tests.
- Mock `expo-secure-store` — do not write to the device keystore in unit tests.
- Reset `peer_key` and `wrapped_key` tables between integration test runs.
