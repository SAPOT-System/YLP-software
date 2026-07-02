# Messaging — Requirements

## Overview

SAPOT supports E2E-encrypted direct messaging between users over three transport channels: WebSocket server relay, direct LAN TCP, and SMS fallback. Messages are stored locally (WatermelonDB) and synced to the server.

---

## User stories

- As a user, I can send a text message to another user and see it delivered immediately if they are online.
- As a user, messages I send are end-to-end encrypted so that the server cannot read them.
- As a user, messages sent to an offline user are queued and delivered when they reconnect.
- As a user, I can send messages directly over the LAN TCP channel when both devices are on the same network, bypassing the server relay.
- As a user, I can reply to a specific message in a conversation (threaded reply).
- As a user, I can send an attachment along with a message.
- As a user, I can see read receipts indicating whether my message has been delivered and read.
- As a user, I can participate in the public broadcast channel visible to all users.
- As a rescuer, I can use SMS fallback to reach users who only have a phone (via the GSM module).

---

## Functional requirements

### Message creation

- Messages are created locally in WatermelonDB before being sent.
- `message.content` stores the E2E-encrypted ciphertext blob (never plaintext).
- `message.conversation_id` links to the conversation; `message.sender_id` is the authenticated user.
- `message.linked_message_id` is a self-referential FK for reply-to threads (nullable).

### Delivery channels (priority order)

1. **LAN TCP direct** — if both peers are discovered via mDNS and a TCP connection is established.
2. **WebSocket relay** — if the target peer is connected to the server's `/ws/` endpoint.
3. **Queue (offline)** — if the target peer is offline, the message is stored in the server's `queue` table and drained on reconnect.
4. **SMS fallback** — for users without the app; requires GSM module.

### Message receipts

- `messagereceipt` records track delivery status per recipient per message.
- P2P-only messages (LAN TCP, never server-routed) must not have `MessageReceipt` rows pushed to the server via sync.
- Receipt status values: `delivered` and `read`.

### Offline queue

- The server's `queue` table stores serialized payloads for offline recipients.
- On reconnect, the server drains the queue.
- The mobile client sends `ack` to confirm receipt; the server removes the queue entry.

### Attachments

- Linked to a message via `attachment.message_id`.
- Stored as files in `static/` on the server; referenced by `attachment.filename` and `attachment.mime_type`.

### Public chat

- A broadcast channel visible to all users, sent via `{ type: "public-chat", ... }` WebSocket message.
- Public chat history retrievable via `GET /public-chat`.

---

## Constraints

- Message content must be encrypted before leaving the device — no plaintext in `message.content`.
- The server relay must never buffer decryptable content.
- LAN TCP direct delivery takes priority over server relay when available.
