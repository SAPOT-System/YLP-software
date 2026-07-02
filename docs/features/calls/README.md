# Calls

Voice and video calling between users using WebRTC. The server relays only signalling messages (SDP offer/answer, ICE candidates) via `SignalingService`; once ICE completes, media flows directly between devices.

P2P (WebRTC media path); server is used only for signalling relay — see [design.md](./design.md) for the full signalling flow and transport modes (`auto` / `lan` / `server`).

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
