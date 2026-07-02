# Keys and Encryption API

Machine-readable spec: [`openapi/keys-and-encryption.yaml`](openapi/keys-and-encryption.yaml) (generated from the live FastAPI app — covers `keys.router`, `wrapped_key.router`, `user_keys.router`).

These endpoints manage the ECDH public keys and wrapped master keys used for E2E encryption. The server stores only public keys, signed credentials, and opaque encrypted blobs — it cannot decrypt message content or master keys. See `mobile-app/sapot-mobile-app/docs/ARCHITECTURE.md` and the `crypto-architecture` skill for the client-side design.

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| POST | `/keys/register` | JWT Bearer (rate-limited 3/min) | Register/replace the current user's ECDH public key; server signs it and returns a `SignedCredential`. |
| GET | `/keys/server-public-key` | None | Retrieve the server's Ed25519 verify key (used to check credential signatures). |
| POST | `/keys/contacts/{peer_id}` | JWT Bearer (rate-limited 30/min) | Upsert a backup of a guest peer's ECDH public key, pre-encrypted client-side under the caller's master key. |
| GET | `/keys/contacts` | JWT Bearer (rate-limited 10/min) | List all backed-up contact key blobs for the current user (opaque to the server). |
| GET | `/keys/{peer_id}/type` | JWT Bearer | Returns `{"is_guest": bool}` — whether `peer_id` has a server-registered `PeerKey`. |
| GET | `/keys/{peer_id}` | JWT Bearer | Retrieve a peer's signed public-key credential. `404` if the peer has no registered key. |
| POST | `/users/wrapped-key` | JWT Bearer (rate-limited 3/min) | Store the current user's wrapped master key (`201`; replaces any existing row). |
| GET | `/users/wrapped-key` | JWT Bearer (rate-limited 10/min) | Retrieve the current user's wrapped master key. `404` if none exists. |
| PUT | `/users/wrapped-key` | JWT Bearer (rate-limited 5/min) | Update the current user's wrapped master key blob. `404` if none exists. |
| POST | `/users/recovery-setup` | JWT Bearer (rate-limited 3/min) | Configure one or more recovery-method copies of the wrapped master key (`201`). |
| GET | `/users/recovery-key` | Recovery session token (`recovery_token` + `method` query params, rate-limited 5/min) | Retrieve a recovery copy of the wrapped master key during the account recovery flow. |
| PUT | `/users/recovery-keys` | JWT Bearer (rate-limited 5/min) | Bulk-replace recovery-method blobs (same body as `/users/recovery-setup`). |

---

## POST /keys/register

Registers/replaces the current user's ECDH public key (`SignedCredential` request/response schema in the YAML). Any existing key for the user is deleted and replaced. Credentials expire 365 days after issuance — this business rule isn't visible in the schema.

---

## POST /keys/contacts/{peer_id}

Used for guest peers who are not server-registered and whose keys are otherwise only available from a local TCP handshake. Upserts on conflict (owner_id, peer_id) — also not visible in the schema.

---

## Wrapped master key

The `wrapped_blob` field on `WrappedKeyRequest` is a single opaque string (the client is responsible for embedding any salt/nonce it needs inside it) — the server does not parse or validate its contents.

## Recovery blobs

`GET /users/recovery-key` requires a `recovery_token` obtained from one of the flows in [auth-and-recovery.md](auth-and-recovery.md), plus the `method` to fetch.

---

See [keys-and-encryption.yaml](openapi/keys-and-encryption.yaml) for exact field-level request/response schemas (`SignedCredential`, `WrappedKeyRequest`, `RecoverySetupRequest`, `RecoveryBlobItem`), or the live server's `/docs` / `/openapi.json`.
