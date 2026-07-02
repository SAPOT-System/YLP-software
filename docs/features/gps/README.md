# GPS Location

Live location sharing for emergency response: any user can stream GPS coordinates, and rescuers view them in real time on a map along with location history. Uses a dedicated WebSocket layer that is fully independent of the messaging `ConnectionService`.

Server-mediated only (dedicated `/gps/ws/<id>` WebSocket, gated by `UserStore.isRescuer`); intentionally has no P2P path.

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
