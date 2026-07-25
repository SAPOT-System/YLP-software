# Messaging

E2E-encrypted direct messaging between users, with local persistence (WatermelonDB), offline queueing, delivery receipts, reply threading, and an SMS fallback for users without the app.

Hybrid: supports both P2P (`lan` mode, direct WebRTC data channel over TCP signalling with mDNS/Zeroconf discovery) and server-mediated (`server` mode, WebSocket relay) transport, with `auto` mode preferring the server relay and falling back to LAN P2P — see [design.md](./design.md) for the full transport-mode breakdown.

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
