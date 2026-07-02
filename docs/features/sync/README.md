# Sync

Keeps WatermelonDB (mobile SQLite) consistent with MariaDB (server) using a WatermelonDB-style pull/push protocol. The app pulls server changes since its last sync timestamp, then pushes local changes; conflicts are detected server-side and returned as `409 Conflict`.

Server-mediated; no P2P path.

## Docs

- [Design](./design.md)
- [Requirements](./requirements.md)
- [Testing](./testing.md)

- [Glossary](../../GLOSSARY.md)
