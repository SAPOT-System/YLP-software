# SMS Gateway

Bridges the main server to an Arduino-based GSM module (SIM800L/SIM900) over serial, via a separate FastAPI microservice. Used for rescuer-initiated SMS to users without the app, and for OTP delivery/verification during recovery and phone verification flows.

Server-mediated; no P2P path (mediated by the main server and the GSM microservice, not a peer-to-peer transport).

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
