# Messaging — Testing

## Test strategy

Messaging tests cover the full delivery pipeline: local creation, transport routing, server relay, offline queue, receipt tracking, and sync. Tests run at both unit level (ChatService, encryption) and integration level (WebSocket relay, sync endpoint).

---

## Unit tests — ChatService

| Scenario | Expected result |
|---|---|
| Send message when peer connected via TCP | Message encrypted and sent via TcpClientAdapter |
| Send message when peer connected via WebSocket only | Message encrypted and sent via WsSignalingAdapter |
| Send message when peer offline | Message stored locally; server queues it |
| Inbound message received | Decrypted and persisted to WatermelonDB `messages` table |
| Reply message has `linked_message_id` set | WatermelonDB record has correct FK to parent message |

---

## Integration tests — WebSocket relay

| Scenario | Expected result |
|---|---|
| Sender connected, recipient connected | Message forwarded immediately to recipient |
| Sender connected, recipient offline | Message stored in `queue` table |
| Recipient reconnects | Server drains queue, delivers pending message |
| Client sends `ack` for queue entry | Queue row deleted |
| Client does not send `ack` | Queue row remains; re-delivered on next reconnect |

---

## Integration tests — sync

| Scenario | Expected result |
|---|---|
| Push new message to server | 200, stored in MariaDB |
| Push same message UUID twice | 200, idempotent upsert (no duplicate) |
| Push `MessageReceipt` for LAN-TCP-only message | Rejected (FK guard) |
| Pull messages after another device pushes | Pulled messages appear in response |
| Soft-delete message (`is_deleted = true`) | Appears in pull as deleted record |

---

## Integration tests — public chat

| Scenario | Expected result |
|---|---|
| Send `public-chat` message | Broadcast to all connected users |
| `GET /public-chat` | Returns history of public messages |
| Unauthenticated user sends public-chat | 401 or connection closed |

---

## Receipt tests

| Scenario | Expected result |
|---|---|
| Message delivered via WebSocket | `messagereceipt.status = "delivered"` |
| Recipient opens message | `messagereceipt.status = "read"` |
| Push receipt for LAN-TCP message | Rejected by sync endpoint |

---

## Coverage targets

- ChatService transport selection: LAN TCP, WebSocket fallback, offline queue — all three paths covered.
- Queue drain: reconnect-and-drain lifecycle tested end-to-end.
- Sync push: idempotency, conflict detection, soft-delete — all tested.

---

## Test conventions

- Use synthetic UUIDs: `alice-uuid`, `bob-uuid` for users.
- Mock `TcpClientAdapter` and `WsSignalingAdapter` in unit tests — no real sockets.
- Use in-memory SQLite WatermelonDB adapter in unit tests.
- Reset `queue`, `messages`, `message_receipts`, `attachment` tables between integration runs.
