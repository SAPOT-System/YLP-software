# LAN Messenger

This document explains how the LAN (Local Area Network) messenger subsystem works in SAPOT. It covers peer discovery via mDNS/Zeroconf, TCP connection establishment, WebRTC handshake, message delivery via data channels, and the sync strategy that keeps the local database consistent with the server.

---

## Overview

The LAN messenger is part of SAPOT's three-transport architecture:

- **`lan` mode** (TCP-only, local network): Direct peer-to-peer messaging via WebRTC data channels over TCP signaling
- **`server` mode** (WebSocket-only, internet): Signaling relay via FastAPI backend
- **`auto` mode** (default): WebSocket first, TCP fallback

This document focuses on the **LAN path**: discovery → TCP connection → WebRTC → data channel → message persistence → sync.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ UI (Conversation Room, Chat List)                       │
├─────────────────────────────────────────────────────────┤
│ ChatService                 (send/receive, persistence) │
├─────────────────────────────────────────────────────────┤
│ WebrtcSessionManager        (data channel management)   │
├─────────────────────────────────────────────────────────┤
│ WebrtcAdapter               (RTCPeerConnection, one/peer)│
├─────────────────────────────────────────────────────────┤
│ SignalingService            (SDP/ICE routing)           │
├─────────────────────────────────────────────────────────┤
│ ConnectionService           (facade, mode guards)        │
├─────────────────────────────────────────────────────────┤
│ TcpClientAdapter            (per-peer TCP connection)   │
├─────────────────────────────────────────────────────────┤
│ TcpServerAdapter            (listen for incoming offers) │
├─────────────────────────────────────────────────────────┤
│ DiscoveryService            (mDNS/Zeroconf discovery)   │
├─────────────────────────────────────────────────────────┤
│ ZeroconfAdapter             (react-native-zeroconf)     │
├─────────────────────────────────────────────────────────┤
│ WatermelonDB                (message, conversation store)│
└─────────────────────────────────────────────────────────┘
```

---

## 1. Peer Discovery (Zeroconf/mDNS)

### Overview

Peers on the same WiFi network are discovered using mDNS (Multicast DNS) via `react-native-zeroconf`. When a device comes online, it publishes itself with Zeroconf and scans for other SAPOT devices on the network.

### Service: DiscoveryService

**Location:** `features/shared/connection/services/discovery-service.ts`

#### Key Responsibilities

1. **Publishing** — Make this device discoverable
2. **Scanning** — Listen for devices coming online/offline
3. **Resending** — When a peer comes online, try to resend any pending messages
4. **Deduplication** — Filter out self (by peerId)

`DiscoveryService.publishDevice()` is idempotent while the device is already published, and `ZeroconfAdapter` serializes publish/cleanup work so listener teardown does not race an in-flight publish.

#### Publishing the Device

```typescript
publishDevice() {
  this.publishDeviceName = `Device-${Date.now()}`;  // unique per session
  
  this.adapter.publishService({
    type: "lanchat",                  // service type
    protocol: "tcp",                  // TCP signaling
    domain: "local.",
    name: this.publishDeviceName,
    port: this.networkConfig.port,    // listening port for incoming WebRTC offers
    txt: {
      id: this.sessionStore.userId,   // peer ID in Zeroconf TXT record
      username: this.userStore.user.username,
      firstName: this.userStore.user.firstName,
      lastName: this.userStore.user.lastName || ""
    }
  });
}
```

The device is published on the port that `TcpServerAdapter` listens on (typically 8765 or next available).

The adapter keeps track of the active published service name so cleanup can unpublish the correct registration even when the caller does not have that name available.

#### Service Resolution (Peer Comes Online)

When a peer is discovered, `serviceResolved` is fired with:

```typescript
adapter.on("serviceResolved", async (peerService: Service) => {
  const peerId = peerService.txt?.id;
  
  // Register peer in local database
  await this.peerService.register(peerService);
  
  // Attempt to resend any pending messages for this peer
  await this.performResendMessagesForPeer(
    peerId,
    peerService.addresses[0],   // LAN IP (e.g., 192.168.1.100)
    peerService.port             // TCP listen port
  );
});
```

**Key point:** When a peer comes online, `performResendMessagesForPeer` is called immediately, triggering `ChatService.tryResendMessage()` for all messages with status `NOT_SENT` in the conversation with that peer.

#### Service Removal (Peer Goes Offline)

```typescript
adapter.on("serviceRemoved", async (peerServiceName: string) => {
  await this.peerService.markOffline(peerServiceName);
});
```

The peer is marked offline in the local database, but conversations and message history persist.

#### Integration with ConnectionService

`DiscoveryService.setConnectionService()` is called after both services are constructed. It subscribes to the `"peer-reconnected"` event emitted by `ConnectionService` when a WebRTC data channel reopens:

```typescript
connectionService.on("peer-reconnected", async (peerId: string) => {
  const discoveredPeer = this.peerService.findDiscoveredPeerById(peerId);
  if (discoveredPeer) {
    // Data channel is now open; retry unsent messages
    await this.performResendMessagesForPeer(
      peerId,
      discoveredPeer.ipAddress,
      discoveredPeer.port
    );
  }
});
```

---

## 2. TCP Connection & Handshake

### Overview

Once a peer is discovered (via Zeroconf), the initiator opens a TCP connection to the peer's listen address and port. The connection is used to relay WebRTC signaling messages (offer, answer, ICE candidates) until the WebRTC data channel opens.

### TcpClientAdapter

**Location:** `features/shared/connection/adapters/tcp-client-adapter.ts`

Wraps `react-native-tcp-socket`. One instance per peer, created on demand and stored in `ConnectionService.tcpClientAdapters`.

```typescript
// From ConnectionService.getTcpClientAdapter()
getTcpClientAdapter(peerId: string): TcpClientAdapter {
  let adapter = this.tcpClientAdapters.get(peerId);
  if (!adapter) {
    adapter = new TcpClientAdapter(peerId);
    this.tcpClientAdapters.set(peerId, adapter);
  }
  return adapter;
}
```

#### Connection Flow

```typescript
// From ChatService.connect()
await this.connectionService.connectToPeer(
  peerId,
  discoveredPeer.ipAddress,    // e.g., "192.168.1.100"
  discoveredPeer.port           // e.g., 8765
);
```

Inside `ConnectionService.connectToPeer()`:

1. Get or create `TcpClientAdapter` for the peer
2. If TCP not connected and `ipAddress` + `port` provided:
   ```typescript
   await tcpAdapter.connect(ipAddress, port);
   ```
3. Create a WebRTC offer
4. Send a handshake message (TCP) to exchange network info
5. Send the offer (TCP) and await answer
6. Begin ICE candidate exchange (TCP or WS depending on mode)

#### TcpServerAdapter

**Location:** `features/shared/connection/adapters/tcp-server-adapter.ts`

The mobile device listens on a port (stored in `NetworkConfig.port`, persisted in secure-config). Incoming TCP connections carry signaling messages from peers trying to reach this device.

```typescript
// From ConnectionService.start()
if (this.isTcpAllowed()) {
  this.tcpServerAdapter.start(this.networkConfig.port);
}
```

Messages received on the server socket:

```typescript
tcpServerAdapter.on("data", async (message: Message) => {
  if (message.type === "ice-candidate" || message.type === "offer" || message.type === "answer" || message.type === "handshake") {
    await this.signalingService.handleIncomingSignaling(message);
  }
  // ... call messages, busy checks, etc.
});
```

---

## 3. WebRTC Handshake & Data Channel

### Overview

Once TCP is connected, the initiating peer sends a **handshake** message to establish network metadata, then sends a WebRTC **offer** with SDP (Session Description Protocol). The receiving peer responds with an **answer**. ICE candidates are exchanged over TCP until the connection is established. Once connected, a **data channel** is opened for messaging.

### Handshake Message

**Type:** `handshake`  
**Transport:** TCP (before WebRTC offer)  
**Source:** `features/shared/connection/services/connection-service.ts:connectToPeer()`

```typescript
// Sent only if TCP is connected (fallback routing scenario)
this.sendMessage(peerId, {
  type: "handshake",
  data: {
    to: peerId,
    from: currentUserId,
    sender: currentUserId,
    ipAddress: this.networkConfig.ipAddress,    // this peer's LAN IP
    port: this.networkConfig.port,              // this peer's TCP listen port
    wsAllowed: this.appModeStore.isWebSocketAllowed(this.userStore.isGuest)
  }
});
```

The handshake allows the receiving peer to note the sender's LAN address and port in case it needs to connect back (not currently used for TCP fallback during data channel transmission, but available for future optimization).

### Offer/Answer Exchange

1. **Initiator sends offer** (via TCP or WS):
   ```typescript
   const { type, sdp } = await webrtcAdapter.createOffer();
   this.signalingService.sendSignalingMessage(peerId, {
     type: "offer",
     data: {
       sdp: { type: "offer", sdp },
       to, from, sender, ipAddress, port
     }
   });
   ```

2. **Receiver receives offer** (via `SignalingService.handleIncomingSignaling()`):
   ```typescript
   case "offer": {
     const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
     await webrtcAdapter.addRemoteDescription(message);
     const { type, sdp } = await webrtcAdapter.createAnswer();
     this.sendSignalingMessage(peerId, { type: "answer", ... });
     break;
   }
   ```

3. **Initiator receives answer** and continues with ICE candidates.

### ICE Candidate Exchange

ICE candidates are exchanged continuously to establish the network path:

```typescript
// From WebrtcSessionManager.setupWebrtcEvents()
webrtcAdapter.on("onicecandidate", (candidate) => {
  this.sendSignaling(peerId, {
    type: "ice-candidate",
    data: {
      ...(sender data),
      candidate
    }
  });
});
```

Each peer receives candidates and adds them:

```typescript
case "ice-candidate": {
  const webrtcAdapter = this.webrtcSessionManager.getWebrtcAdapter(peerId);
  await webrtcAdapter.addIceCandidate(message);
  break;
}
```

### Data Channel Opening

Once the WebRTC connection is established, the data channel is automatically opened:

```typescript
// From WebrtcSessionManager.setupWebrtcEvents()
webrtcAdapter.on("datachannel-open", () => {
  this.emit("peer-reconnected", peerId);  // Signal to DiscoveryService
});
```

From `DiscoveryService`:

```typescript
connectionService.on("peer-reconnected", async (peerId: string) => {
  // Trigger resend of any NOT_SENT messages
  await this.performResendMessagesForPeer(...);
});
```

---

## 4. Chat Message Send/Receive Path

### Message Send Flow (LAN)

```
User types "Hello"
  ↓
ChatService.sendChatMessage("Hello")
  ↓
Create Message + MessageStatus(SENDING) in WatermelonDB
  ↓
ConnectionService.sendChatMessage(peerId, messageData)
  ├─ WebRTC data channel open? YES → send over data channel
  │  └─ WebrtcSessionManager.sendChatMessage()
  │     └─ WebrtcAdapter.sendDataMessage({ type: "chat", data })
  │        └─ RTCDataChannel.send(JSON.stringify(...))
  │
  └─ NO → In LAN mode, throw error (no fallback to WS)
      └─ Error: "No data channel and WS not allowed in lan mode"
  ↓
Start 12s ACK timeout
  If no ACK arrives, revert to NOT_SENT
  ↓
Wait for ACK / DELIVERED receipt
  ↓
MessageStatus updated to SENT or DELIVERED
  ↓
SyncService.syncNow() triggered (async, fire-and-forget)
  ↓
Push message_receipts to server
```

**Key files:**
- `features/chat/services/chat-service.ts:sendChatMessage()` (lines 430–478)
- `features/shared/connection/services/connection-service.ts:sendChatMessage()` (lines 819–849)
- `features/shared/connection/services/webrtc-session-manager.ts:sendChatMessage()` (lines 236–273)

### Message Receive Flow (LAN)

```
Peer sends message over WebRTC data channel
  ↓
WebrtcAdapter receives "chat" type message
  ↓
WebrtcSessionManager.setupWebrtcEvents() listener:
  webrtcAdapter.on("receivedMessage", async (msg) => {
    chatService.handleIncomingChatMessage(msg.data);
  })
  ↓
ChatService.handleIncomingChatMessage(data)
  ├─ Check if message already exists (dedup by messageId)
  │  └─ If exists, send ACK and return (don't insert duplicate)
  │
  ├─ Get or create sender Peer in WatermelonDB
  │
  ├─ Get or create Conversation (DIRECT type)
  │  └─ Check for existing direct conversation by participants
  │
  ├─ Save Message + MessageStatus(DELIVERED) to WatermelonDB
  │
  ├─ Send ACK back to sender
  │  └─ ConnectionService.sendAckMessage(senderId, { messageId })
  │
  └─ Show local notification
  ↓
SyncService.syncNow() triggered (async)
  ↓
Push message_receipts with status DELIVERED to server
```

**Key files:**
- `features/chat/services/chat-service.ts:handleIncomingChatMessage()` (lines 168–223)
- `features/shared/connection/services/webrtc-session-manager.ts:setupWebrtcEvents()` (lines 85–105)

### ACK/DELIVERED Flow

The receiver acknowledges receipt via an ACK message:

```typescript
// From ChatService.handleIncomingChatMessage() → acknowledgeIncomingMessage()
this.connectionService.sendAckMessage(senderId, {
  messageId,
  to: senderId,
  from: currentUserId
});
```

The sender receives the ACK and updates the message status:

```typescript
// From WebrtcSessionManager.setupWebrtcEvents() → receivedMessage "ack"
await this.chatService.handleAckMessage(message.data.messageId);

// From ChatService.handleAckMessage()
await this.messageStatusRepository.updateMessageStatusByMessage(
  messageId,
  MessageStatusType.DELIVERED
);
```

---

## 5. Data Stores & Schema

### WatermelonDB Schema

**Location:** `features/shared/core/database/schema.ts` (version 11 — see [DATABASE.md](DATABASE.md) for the full column reference)

Tables relevant to LAN messaging:

#### `conversations`

```typescript
{
  name: "conversations",
  columns: [
    { name: "type", type: "string" },           // "direct" | "group" | "solo" | "sms"
    { name: "title", type: "string", optional },
    { name: "created_at", type: "number" },
    { name: "updated_at", type: "number" },
    { name: "is_deleted", type: "boolean" }
  ]
}
```

**Model:** `features/shared/core/database/model/Conversation.ts`

#### `conversation_participants`

```typescript
{
  name: "conversation_participants",
  columns: [
    { name: "conversation", type: "string" },   // FK to conversation.id
    { name: "user", type: "string" },           // FK to peers or guest_user
    { name: "joined_at", type: "number" },
    { name: "is_deleted", type: "boolean" },
    { name: "created_at", type: "number" },
    { name: "updated_at", type: "number" }
  ]
}
```

#### `messages`

```typescript
{
  name: "messages",
  columns: [
    { name: "conversation", type: "string" },   // FK to conversation.id
    { name: "sender", type: "string" },         // FK to peers
    { name: "message_type", type: "string" },   // "text" | "file" | "call_log" | "sms"
    { name: "content", type: "string" },
    { name: "created_at", type: "number" },     // timestamp (ms since epoch)
    { name: "updated_at", type: "number" },
    { name: "is_deleted", type: "boolean" },
    { name: "linked_message_id", type: "string", optional },  // added v8
    { name: "is_encrypted", type: "boolean", optional }        // added v9
  ]
}
```

**Model:** `features/shared/core/database/model/Message.ts`

**Deduplication:** Messages are created with an explicit `id` (the messageId generated by the sender). On incoming message, `MessageRepository.queryMessageById(messageId)` checks if the message already exists; if so, the receive handler returns early.

#### `message_receipts`

```typescript
{
  name: "message_receipts",
  columns: [
    { name: "message", type: "string" },        // FK to messages.id
    { name: "user", type: "string" },           // FK to peers (the user who received it)
    { name: "status", type: "string" },         // "sending" | "sent" | "not_sent" | "delivered" | "read"
    { name: "created_at", type: "number" },
    { name: "updated_at", type: "number" },
    { name: "is_deleted", type: "boolean" }
  ]
}
```

**Model:** `features/shared/core/database/model/MessageStatus.ts`

**Status transitions** (`MessageStatusType`, stored lowercase):
- **`sending`** → initial state (message created, not yet sent)
- **`sent`** → received ACK over WebRTC data channel
- **`not_sent`** → ACK timeout (12 s, `chat-message-service.ts`) or send error; eligible for retry
- **`delivered`** → peer acknowledged receipt (incoming message)
- **`read`** → peer opened the conversation; set from the inbound `seen` data-channel message

Only `sent`, `delivered` and `read` are pushed to the server — `sending` and `not_sent` stay local
(see [SYNC.md](SYNC.md#2-push-post-syncpush)).

#### `peers`

```typescript
{
  name: "peers",
  columns: [
    { name: "username", type: "string" },
    { name: "is_online", type: "boolean" },     // set by discovery service
    { name: "first_name", type: "string" },
    { name: "last_name", type: "string", optional },
    { name: "email", type: "string", optional },
    { name: "phone_number", type: "string", optional },
    { name: "email_verified", type: "boolean", optional }
  ]
}
```

**Model:** `features/shared/core/database/model/Peer.ts`

### Repository Pattern

Each table has a repository class providing CRUD + query methods. Example:

**MessageRepository** (`features/chat/repositories/message-repository.ts`)

```typescript
// Save message with explicit id (for dedup)
async saveMessage(newMessage: {
  sender: Peer | GuestUser;
  content: string;
  conversation: Conversation;
  messageId?: string;
  messageType?: MessageType;
}): Promise<Message> {
  return await this.db.write(async () => {
    const message = await this.messagesCollection.create((m) => {
      if (newMessage.messageId) {
        m._raw.id = newMessage.messageId;  // Use sender's ID
      }
      m.sender.set(newMessage.sender);
      m.conversation.set(newMessage.conversation);
      m.content = newMessage.content;
      m.createdAt = new Date();
      m.updatedAt = new Date();
      m.isDeleted = false;
    });
    return message;
  });
}

// Dedup check
async queryMessageById(id: string): Promise<Message | undefined> {
  try {
    return await this.messagesCollection.find(id);
  } catch {
    return undefined;
  }
}

// Fetch messages in conversation
async queryMessagesByConversation(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<Message[]> {
  return await this.messagesCollection
    .query(
      Q.where("conversation", conversationId),
      Q.sortBy("created_at", Q.desc),
      Q.skip(offset),
      Q.take(limit)
    )
    .fetch();
}
```

---

## 6. Sync Execution

### Overview

After messaging, the app syncs with the server to ensure the local database is consistent with the server state. Sync uses a **pull-then-push** strategy:

1. **Pull:** Download changes from server since last sync
2. **Push:** Upload local changes (messages, receipts, etc.)

### SyncService

**Location:** `features/sync/services/sync-service.ts`

#### Sync Triggers (LAN)

| Event | Trigger |
|-------|---------|
| App open | `MainContainer.initialize()` → `syncService.initialize()` → `syncNow()` |
| Message sent | `ChatService.sendChatMessage()` → `void syncService.syncNow()` |
| ACK received | `ChatService.handleAckMessage()` → `void syncService.syncNow()` |
| Periodic | `setInterval()` in `MainContainer` every 5 minutes |
| Network restored | `NetInfo.addEventListener` → `syncService.handleConnectivityChange(true)` |
| Manual | Drawer "Sync Now" button |
| Retry | Exponential backoff on failure |

All triggers are **fire-and-forget** (`void`). An `isSyncing` flag prevents concurrent syncs.

#### Sync Cycle: Pull

```typescript
// From SyncService.syncNow() → pullChanges callback
const lastPulledAt = await getSyncLastPulledAt();  // 0 on first sync
const { changes, timestamp } = await this.pullFromServer(schemaVersion, lastPulledAt);
const normalizedChanges = await this.normalizePullChanges(changes);
await saveSyncLastPulledAt(timestamp);  // persist cursor
return { changes: normalizedChanges, timestamp };
```

1. Read the `lastPulledAt` cursor from `expo-secure-store`
2. Call `GET /sync/pull?last_pulled_at=<ts>&schema_version=<n>`
3. Server returns records created/updated since `lastPulledAt`
4. **Normalize** field names (server: snake_case → WatermelonDB: camelCase)
5. **Deduplicate** — filter out records that already exist locally (prevent duplicate inserts)
6. **Persist cursor** — save the server's returned timestamp
7. Return normalized changes to WatermelonDB, which applies them atomically

#### Sync Cycle: Push

```typescript
// From SyncService.syncNow() → pushChanges callback
const lastPulledAt = await getSyncLastPulledAt();
const changes = // WatermelonDB's dirty records
const payload = await this.buildPushPayload(changes);
await pushLocalDataApi({ last_pulled_at: lastPulledAt, changes: payload });
```

1. Read the same `lastPulledAt` cursor
2. Get WatermelonDB's dirty (locally modified) records
3. **Build payload** — convert to server format, apply filtering rules
4. POST to `POST /sync/push` with payload
5. Payload includes:
   - `conversations` (created, updated, deleted)
   - `conversation_participants`
   - `messages`
   - `message_receipts` (status updates)
   - `calls`
   - `call_participants`

#### Field Normalization

`normalizePullChanges()` converts server fields to WatermelonDB columns:

| Server Field | WatermelonDB Column |
|---|---|
| `conversation_id` | `conversation` (FK) |
| `user_id` | `user` (FK) |
| `sender_id` | `sender` (FK) |
| `call_type` | `call_type` |
| `is_deleted` | `is_deleted` |
| `created_at` | `created_at` (timestamp as number) |
| `message_type` | `message_type` |

Example:

```typescript
// normalizePullChanges() for messages
messages: {
  created: changes.messages.created
    .filter((item) => !existingIds.messages.has(item.id ?? ""))  // dedup
    .map((item) => ({
      ...item,
      conversation: item.conversation_id,  // rename
      sender: item.sender_id,              // rename
      message_type: item.message_type,
      is_deleted: item.is_deleted ?? false,
      created_at: this.toTimestamp(item.created_at),  // parse
      updated_at: this.toTimestamp(item.updated_at)
    }))
}
```

#### Push Filtering

Not all local records are synced to the server. Filtering rules:

##### Message Filtering

Messages are always pushed, independently of their receipt state. The server can
store a message without a receipt, so an offline recipient no longer leaves the
sender's WatermelonDB row as the only durable copy.

```typescript
messages: {
  created: changes.messages.created.map(toServerPayload),
  updated: changes.messages.updated.map(toServerPayload),
  deleted: changes.messages.deleted
}
```

**Rationale:** Delivery state and history durability are separate concerns. A message
must survive logout or device loss even if the peer has not acknowledged it.

##### Receipt Filtering

`SENDING` and `NOT_SENT` are local-only and are not pushed. `SENT`,
`DELIVERED`, and `READ` are durable statuses and are synced:

```typescript
const transientStatuses = new Set([
  MessageStatusType.SENDING,
  MessageStatusType.NOT_SENT
]);
return !transientStatuses.has(status);
```

Filtered receipts are returned to WatermelonDB via `experimentalRejectedIds`.
This keeps them dirty so a later status transition is retried instead of being
incorrectly marked clean.

For self-conversation messages, **SENT** is converted to **DELIVERED** before
push because local persistence completes delivery immediately:

```typescript
if (selfMessageIds.has(msgId) && rec.status === MessageStatusType.SENT) {
  return { ...rec, status: MessageStatusType.DELIVERED };
}
```

---

## 7. Data Consistency & Error Avoidance

### Deduplication by messageId

Every message sent has a unique `messageId` generated by the sender (typically a UUID). On the receiving end:

1. Before inserting a message, check if it already exists by `messageId`
2. If it exists, send ACK and return (don't create duplicate)
3. If it doesn't exist, insert and process normally

```typescript
// From ChatService.handleIncomingChatMessage()
const existingMessage = await this.messageRepository.queryMessageById(data.messageId);
if (existingMessage) {
  chatLog.info("chat › incoming message deduped", {
    messageId: data.messageId
  });
  this.acknowledgeIncomingMessage(sender.id, data.messageId);
  return;  // Don't re-insert
}
```

This ensures that if a message is received twice (e.g., retransmitted after network flicker), only one database record is created.

### ACK Timeout + Retry

When a message is sent, a **12-second timeout** is started. If no ACK arrives:

```typescript
// From ChatService.sendAndTrackMessageStatus()
const timeout = setTimeout(async () => {
  this.ackTimeouts.delete(newMessage.id);
  await this.messageStatusRepository.updateMessageStatusById(
    newMessageStatus.id,
    MessageStatusType.NOT_SENT
  );
}, 12000);  // 12s
```

The message's status reverts to `NOT_SENT`, making it eligible for the retry queue. When the peer comes online (or via `peer-reconnected` event), `DiscoveryService` triggers `tryResendMessage()`:

```typescript
// From DiscoveryService.performResendMessagesForPeer()
const unsentMessages = await this.chatService.getAllNotSentMessageForPeer(peerId);
for (const msg of unsentMessages) {
  await this.chatService.tryResendMessage(msg, peerId, { ipAddress, port });
}
```

Each retry attempt resets the status to SENDING and restarts the 12s timeout.

### Conversation Idempotency

When a message arrives from an unknown sender, a conversation is created if it doesn't exist:

```typescript
// From ChatService.getOrCreateConversationForIncoming()
const isConversationExist = await this.conversationRepository.isConversationExist(conversationId);

if (!isConversationExist) {
  // Check for existing direct conversation by participants
  const existingConversationId = await this.conversationParticipantRepository
    .isDirectConversationExists([sender.id, currentUserId]);
  
  if (existingConversationId) {
    // Reuse existing conversation
    return await this.conversationRepository.queryConversationById(existingConversationId);
  }
  
  // Create new conversation
  return await this.createChatRoom(sender, conversationId);
}
```

This prevents duplicate conversations between the same two users. The creation is wrapped in `database.write()` for atomicity:

```typescript
return await database.write(async () => {
  const conversation = await this.conversationRepository.saveConversation(
    { type: ConversationType.DIRECT, id: conversationId },
    true  // skipLocal
  );
  await this.conversationParticipantRepository.saveMultipleConversationParticipant(
    [peer, currentUser],
    conversation,
    true
  );
  return conversation;
});
```

### Sync Conflict Recovery (409 Handling)

If the server returns HTTP 409 (Conflict), it means the server's data has advanced past the client's `lastPulledAt` cursor. The client resets the cursor and retries:

```typescript
// From SyncService.syncNow() error handler
if (isAxiosError(error) && error.response?.status === 409) {
  syncLog.warn("sync › 409 conflict, resetting lastPulledAt");
  await saveSyncLastPulledAt(0);  // Force full re-pull next sync
  this.scheduleRetry();
  return;
}
```

This is a safe operation because WatermelonDB's deduplication (by `id`) prevents duplicate inserts.

### Exponential Backoff

On any other sync failure, the service schedules a retry with exponential backoff (up to 5 attempts):

```typescript
// From SyncService.scheduleRetry()
const MAX_ATTEMPTS = 5;
const BASE_MS = 1_000;
const MAX_MS = 30_000;

const base = Math.min(MAX_MS, Math.round(BASE_MS * Math.pow(1.8, attempt)));
const delay = Math.max(200, Math.round(base * (0.8 + Math.random() * 0.4)));
// delay ≈ [1s, 1.8s, 3.2s, 5.8s, 10.4s, ...] with ±20% jitter
```

---

## 8. Mode Enforcement (LAN)

### AppModeStore

**Location:** `features/shared/core/stores/app-mode-store.ts`

Controls which transports are allowed based on the selected mode and guest status.

```typescript
isWebSocketAllowed(isGuest: boolean): boolean {
  const effectiveMode = this.getEffectiveMode(isGuest);
  // false if mode === "lan"
  return effectiveMode !== "lan";
}

isTcpAllowed(isGuest: boolean): boolean {
  const effectiveMode = this.getEffectiveMode(isGuest);
  // false if mode === "server"
  return effectiveMode !== "server";
}

isZeroconfAllowed(isGuest: boolean): boolean {
  // true if mode === "lan" || mode === "auto"
  return effectiveMode === "lan" || effectiveMode === "auto";
}
```

### Guards in ConnectionService

Before allowing operations, the service checks mode:

```typescript
// From ConnectionService.sendChatMessage()
const transport = this.connectionService.sendChatMessage(peerId, messageData);

// In sendChatMessage()
if (webrtcConnected) {
  // ... send over data channel
  return "webrtc";
}

// No fallback to WS in LAN mode
const effectiveMode = this.appModeStore.getEffectiveMode(this.userStore.isGuest);
if (effectiveMode === "lan") {
  throw new Error("No data channel and WS not allowed in lan mode");
}
```

**In LAN mode, there is no fallback to WebSocket.** Messages can only be sent if WebRTC data channel is open. If the data channel is not open and WS is disabled, sending will throw an error.

---

## 9. TCP Message Types (LAN Signaling)

Messages sent over TCP (and WebRTC data channels for chat) follow a standardized format.

### Signaling Messages

See `docs/CONNECTION_MESSAGES.md` for the full protocol. Key types used in LAN:

#### `handshake`
```json
{
  "type": "handshake",
  "data": {
    "to": "peer-id",
    "from": "sender-id",
    "sender": "sender-id",
    "ipAddress": "192.168.1.100",
    "port": 8765,
    "wsAllowed": false
  }
}
```

#### `offer`
```json
{
  "type": "offer",
  "data": {
    "to": "peer-id",
    "from": "sender-id",
    "sender": "sender-id",
    "ipAddress": "192.168.1.100",
    "port": 8765,
    "sdp": { "type": "offer", "sdp": "v=0\r\n..." }
  }
}
```

#### `answer`
```json
{
  "type": "answer",
  "data": {
    "to": "peer-id",
    "sender": "sender-id",
    "ipAddress": "192.168.1.100",
    "port": 8765,
    "sdp": { "type": "answer", "sdp": "v=0\r\n..." }
  }
}
```

#### `ice-candidate`
```json
{
  "type": "ice-candidate",
  "data": {
    "to": "peer-id",
    "sender": "sender-id",
    "ipAddress": "192.168.1.100",
    "port": 8765,
    "candidate": { "candidate": "candidate:...", ... }
  }
}
```

### Data Channel Messages (WebRTC)

Once the data channel is open, messages are sent as WebRTC messages:

#### Chat Message
```json
{
  "type": "chat",
  "data": {
    "messageId": "uuid-1",
    "from": "sender-id",
    "to": "recipient-id",
    "conversationId": "conv-id",
    "message": "Hello!",
    "sentAt": 1704067200000,
    "messageType": "TEXT",
    "senderProfile": {
      "username": "alice",
      "firstName": "Alice",
      "lastName": "Smith"
    }
  }
}
```

#### ACK
```json
{
  "type": "ack",
  "data": {
    "messageId": "uuid-1",
    "from": "recipient-id",
    "to": "sender-id"
  }
}
```

#### Seen (Read Receipt)
```json
{
  "type": "seen",
  "data": {
    "conversationId": "conv-id",
    "from": "recipient-id",
    "to": "sender-id"
  }
}
```

---

## 10. Key Files Reference

| File | Purpose |
|---|---|
| `features/shared/connection/services/connection-service.ts` | Central facade; TCP/WebRTC orchestration; mode guards |
| `features/shared/connection/services/webrtc-session-manager.ts` | Per-peer WebRTC session management |
| `features/shared/connection/services/discovery-service.ts` | mDNS/Zeroconf peer discovery |
| `features/chat/services/chat-service.ts` | Message send/receive; conversation mgmt; ACK timeout |
| `features/sync/services/sync-service.ts` | Pull-then-push sync; field normalization; filtering |
| `features/shared/connection/adapters/tcp-client-adapter.ts` | Client-side TCP connection wrapper |
| `features/shared/connection/adapters/tcp-server-adapter.ts` | Server-side TCP listener |
| `features/shared/connection/adapters/webrtc-adapter.ts` | RTCPeerConnection wrapper |
| `features/shared/connection/adapters/zeroconf-adapter.ts` | mDNS/Zeroconf wrapper |
| `features/shared/core/database/schema.ts` | WatermelonDB schema (v11) |
| `features/shared/core/database/migrations.ts` | Schema migration steps |
| `features/chat/repositories/message-repository.ts` | Message CRUD operations |
| `features/chat/repositories/conversation-repository.ts` | Conversation CRUD |
| `features/chat/repositories/conversation-participant-repository.ts` | Participant join/leave |
| `features/chat/repositories/message-status-repository.ts` | Message status transitions |
| `features/shared/core/stores/app-mode-store.ts` | Mode enforcement (lan/server/auto) |
| `features/shared/core/stores/secure-config.ts` | Persistent config (expo-secure-store) |

---

## 11. Testing Considerations

### Mocking in Tests

Global mocks for WatermelonDB, TCP sockets, WebRTC, and Zeroconf are configured in `jest-setup.js`. Key patterns:

1. **Database:** Use `database.write()` for transactional test setup
2. **TCP:** Mock `TcpClientAdapter.connect()` and `TcpServerAdapter.on("data")`
3. **WebRTC:** Mock `WebrtcAdapter` events (`connection-established`, `receivedMessage`)
4. **Discovery:** Mock `ZeroconfAdapter.on("serviceResolved")`

See `test/mocks/` for builder factories and helper functions.

---

## 12. Future Improvements

- **TCP Fallback for Chat:** Currently, chat messages have no fallback if the WebRTC data channel is not open in LAN mode. Consider implementing TCP message relay as a fallback.
- **Conversation History Sync:** Initial data sync is full (lastPulledAt=0); consider implementing incremental conversation queries.
- **Conflict-Free Replicated Data Types (CRDTs):** For future group messaging and offline-first scenarios.
- **Message Encryption:** E2E encryption for chat messages in transit.
