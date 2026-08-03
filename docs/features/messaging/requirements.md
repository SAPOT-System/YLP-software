# Messaging — Requirements

## Overview

SAPOT supports E2E-encrypted direct messaging between users over three transport channels: WebSocket server relay, direct LAN TCP, and SMS fallback. Messages are stored locally (WatermelonDB) and synced to the server.

---

## User Stories

| ID | As a… | I want to… | So that… |
|----|-------|-----------|----------|
| MS-01 | user | send a text message to another user | I see it delivered immediately if they are online |
| MS-02 | user | have messages I send E2E encrypted | the server cannot read them |
| MS-03 | user | have messages sent to an offline user queued | they are delivered when the recipient reconnects |
| MS-04 | user | send messages directly over the LAN TCP channel when both devices are on the same network | I bypass the server relay |
| MS-05 | user | reply to a specific message in a conversation | I can thread my response |
| MS-06 | user | send an attachment along with a message | I can share files, not just text |
| MS-07 | user | see read receipts indicating whether my message has been delivered and read | I know the status of my message |
| MS-08 | user | participate in the public broadcast channel visible to all users | I can reach everyone at once |
| MS-09 | rescuer | use SMS fallback to reach users who only have a phone (via the GSM module) | I'm not limited to app-connected users |

---

## Functional Requirements

### FR-MS-01 — Message creation

- Messages are created locally in WatermelonDB before being sent.
- `message.content` stores the E2E-encrypted ciphertext blob (never plaintext).
- `message.conversation_id` links to the conversation; `message.sender_id` is the authenticated user.

### FR-MS-02 — Delivery channels (priority order)

1. **LAN TCP direct** — if both peers are discovered via mDNS and a TCP connection is established.
2. **WebSocket relay** — if the target peer is connected to the server's `/ws/` endpoint.
3. **Queue (offline)** — if the target peer is offline, the message is stored in the server's `queue` table and drained on reconnect.
4. **SMS fallback** — for users without the app; requires GSM module.

### FR-MS-03 — Message receipts

- `messagereceipt` records track delivery status per recipient per message.
- P2P-only messages (LAN TCP, never server-routed) must not have `MessageReceipt` rows pushed to the server via sync.
- Receipt status values: `delivered` and `read`.

### FR-MS-04 — Offline queue

- The server's `queue` table stores serialized payloads for offline recipients.
- On reconnect, the server drains the queue.
- The mobile client sends `ack` to confirm receipt; the server removes the queue entry.

### FR-MS-05 — Attachments

- Linked to a message via `attachment.message_id`.
- Stored as files in `static/` on the server; referenced by `attachment.filename` and `attachment.mime_type`.

### FR-MS-06 — Public chat

- A broadcast channel visible to all users, sent via `{ type: "public-chat", ... }` WebSocket message.
- Public chat history retrievable via `GET /public-chat`.

---

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-MS-01 | Message content must be encrypted before leaving the device — no plaintext in `message.content` |
| NFR-MS-02 | The server relay must never buffer decryptable content |
| NFR-MS-03 | LAN TCP direct delivery takes priority over server relay when available |

---

## Out of Scope

See [design.md#non-goals](design.md#non-goals) for what this feature explicitly does not cover.
