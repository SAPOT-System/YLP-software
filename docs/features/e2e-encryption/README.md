# E2E Encryption

E2E encryption for all messages and direct data exchanged between peers, using NaCl box (Curve25519 ECDH + XSalsa20-Poly1305). Keys are derived from the user's password and protected at rest; the server stores only public keys and wrapped private-key blobs — it never sees plaintext.

Applies identically on both P2P and server-mediated paths: the server only ever sees ciphertext, whether a message travels the LAN data channel or the WebSocket relay.

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
