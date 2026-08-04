import { v4 as uuidv4 } from "uuid";
import { db } from "../db";
import { push, pull } from "../sync/syncEngine";
import { createMessage } from "../records/Createmessage";
import {
  createMessageReceipt,
  updateMessageReceiptStatus,
  markConversationMessagesAsRead,
} from "../records/Createmessagereceipt";
import { initAdminKeyPair } from "../adminEncryption";

/* =========================
   TYPES
========================= */
type ChatPayload = {
  messageId: string;
  conversationId: string;
  from: string;
  to: string;
  message: string;
  sentAt: string;
  messageType: "text" | "file" | "call_log";
  senderProfile: {
    username: string;
    firstName: string;
    lastName?: string;
  };
};

type AckPayload = {
  messageId: string;
  from: string;
  to: string;
};

type SeenPayload = {
  conversationId: string;
  from: string;
  to: string;
};

type IncomingMessage =
  | { type: "chat"; data: ChatPayload }
  | { type: "ack"; data: AckPayload }
  | { type: "seen"; data: SeenPayload };

type MessageHandler = (message: IncomingMessage) => void;

/* =========================
   SINGLETON STATE
========================= */
let socket: WebSocket | null = null;
let currentUserId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let shouldReconnect = true;
const messageHandlers = new Set<MessageHandler>();

/* =========================
   EXTERNAL LISTENER REGISTRATION
   Use this to subscribe to incoming messages in your UI/components
========================= */
export function onMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  // Returns an unsubscribe function
  return () => messageHandlers.delete(handler);
}

function notifyHandlers(message: IncomingMessage) {
  messageHandlers.forEach((handler) => handler(message));
}

/* =========================
   TOKEN FETCH
========================= */
export async function getToken(): Promise<string> {
  const res = await fetch("/api/get-token");
  if (!res.ok) throw new Error("Failed to fetch WS token");
  const data = await res.json();
  return data.token;
}

/* =========================
   SEND HELPERS
========================= */
function sendRaw(payload: object) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("[WS] Tried to send while socket not open:", payload);
    return;
  }
  socket.send(JSON.stringify(payload));
}

function sendAck({ messageId, to }: { messageId: string; to: string }) {
  if (!currentUserId) return;
  sendRaw({
    type: "ack",
    data: {
      messageId,
      from: currentUserId,
      to,
    },
  });
}

export function sendSeen({
  conversationId,
  to,
}: {
  conversationId: string;
  to: string;
}) {
  if (!currentUserId) return;
  sendRaw({
    type: "seen",
    data: {
      conversationId,
      from: currentUserId,
      to,
    },
  });
}

/* =========================
   INCOMING MESSAGE HANDLERS
========================= */
async function handleChat(data: ChatPayload) {
  // 1. Save peer profile if not already stored
  const existingPeer = await db.peers.get(data.from);
  if (!existingPeer || !existingPeer.username) {
    await db.peers.put({
      id: data.from,
      username: data.senderProfile.username,
      first_name: data.senderProfile.firstName,
      last_name: data.senderProfile.lastName ?? null,
      is_online: true,
      email: null,
      phone_number: null,
      email_verified: null,
    });
  }

  // 2. Save message locally (mobile sends plaintext over the relay)
  await createMessage({
    id: data.messageId,
    conversation_id: data.conversationId,
    sender_id: data.from,
    content: data.message,
    message_type: data.messageType,
  });

  // 3. Create a 'delivered' receipt for this message
  await createMessageReceipt({
    id: uuidv4(),
    message_id: data.messageId,
    user_id: currentUserId!,
    status: "delivered",
  });

  // 4. Auto-send ack back to sender
  sendAck({ messageId: data.messageId, to: data.from });

  // 5. Push to server immediately
  await pull(); // to avoid conflicts
  await push();

  // 6. Notify UI listeners
  notifyHandlers({ type: "chat", data });
}

async function handleAck(data: AckPayload) {
  // Update MY outgoing message receipt to 'sent'
  await updateMessageReceiptStatus({
    message_id: data.messageId,
    user_id: data.from, // the other person acknowledged receipt
    status: "sent",
  });

  notifyHandlers({ type: "ack", data });
}

async function handleSeen(data: SeenPayload) {
  // The other person has read our messages — mark all our outgoing
  // messages in this conversation as 'read'
  const messages = await db.messages
    .where("conversation_id")
    .equals(data.conversationId)
    .filter((m) => m.sender_id === currentUserId)
    .toArray();

  const now = Date.now();
  for (const msg of messages) {
    const receipt = await db.message_receipts
      .where("message_id")
      .equals(msg.id)
      .filter((r) => r.user_id === data.from)
      .first();

    if (receipt && receipt.status !== "read") {
      const updated = { ...receipt, status: "read" as const, updated_at: now };
      await db.message_receipts.put(updated);
    }
  }

  // Pull to sync read state from server
  await pull();

  notifyHandlers({ type: "seen", data });
}

/* =========================
   CONNECT
========================= */
export async function connectWebSocket(userId: string) {
  if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) return;

  isConnecting = true;
  shouldReconnect = true;
  currentUserId = userId;

  try {
    const token = await getToken();
    const raw = process.env.NEXT_PUBLIC_WEBSOCKET_DOMAIN;
    const wsDomain = (raw || `wss://${window.location.host}`)
      .replace(/^http:\/\//, "ws://")
      .replace(/^https:\/\//, "wss://");

    const url = `${wsDomain}/ws/?token=${token}`;

    socket = new WebSocket(url);

    socket.onopen = () => {
      console.log("[WS] Connected");
      console.log("[WS URL]", url);
      isConnecting = false;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Initialize ECDH keypair and register public key with server
      void initAdminKeyPair(token);
    };

    socket.onmessage = async (event: MessageEvent) => {
      let parsed: IncomingMessage;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        console.warn("[WS] Failed to parse message:", event.data);
        return;
      }

      switch (parsed.type) {
        case "chat":
          await handleChat(parsed.data as ChatPayload);
          break;
        case "ack":
          await handleAck(parsed.data as AckPayload);
          break;
        case "seen":
          await handleSeen(parsed.data as SeenPayload);
          break;
        default:
          console.warn("[WS] Unknown message type:", (parsed as any).type);
      }
    };

    socket.onclose = (event) => {
      console.warn("[WS] Disconnected:", event.code, event.reason, event.wasClean);
      isConnecting = false;
      socket = null;
      if (shouldReconnect) {
        // Auto-reconnect after 3 seconds unless the page explicitly disconnected.
        reconnectTimer = setTimeout(() => {
          console.log("[WS] Reconnecting...");
          connectWebSocket(userId);
        }, 3000);
      }
    };

    socket.onerror = () => {
      // Browser error events omit the network/TLS cause. Do not log the token.
      console.error("[WS] Connection error:", new URL(url).origin);
      isConnecting = false;
      socket?.close();
    };
  } catch (err) {
    console.error("[WS] Failed to connect:", err);
    isConnecting = false;
  }
}

/* =========================
   DISCONNECT
========================= */
export function disconnectWebSocket() {
  shouldReconnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
  currentUserId = null;
  isConnecting = false;
}

/* =========================
   SEND CHAT MESSAGE
   Call this when the current user sends a message
========================= */
export async function sendChatMessage({
  conversationId,
  to,
  message,
  messageType = "text",
  senderProfile,
}: {
  conversationId: string;
  to: string;
  message: string;
  messageType?: "text" | "file" | "call_log";
  senderProfile: {
    username: string;
    firstName: string;
    lastName?: string;
  };
}) {
  if (!currentUserId) throw new Error("WebSocket not connected");

  const messageId = uuidv4();
  const sentAt = new Date().toISOString();

  // 1. Save plaintext locally
  await createMessage({
    id: messageId,
    conversation_id: conversationId,
    sender_id: currentUserId,
    content: message,
    message_type: messageType,
  });

  // 2. Create an initial 'sent' receipt for ourselves
  await createMessageReceipt({
    id: uuidv4(),
    message_id: messageId,
    user_id: currentUserId,
    status: "sent",
  });

  // 3. Send plaintext over WebSocket (TLS handles transport security)
  sendRaw({
    type: "chat",
    data: {
      messageId,
      conversationId,
      from: currentUserId,
      to,
      message,
      sentAt,
      messageType,
      senderProfile,
    },
  });

  // 4. Push to server
  await push();

  return messageId;
}

/* =========================
   MARK CONVERSATION AS SEEN
   Call this when user opens/views a conversation
========================= */
export async function markConversationSeen({
  conversationId,
  to,
}: {
  conversationId: string;
  to: string;
}) {
  if (!currentUserId) return;

  // 1. Update local receipts to 'read'
  await markConversationMessagesAsRead({
    conversation_id: conversationId,
    current_user_id: currentUserId,
  });

  // 2. Notify the other person
  sendSeen({ conversationId, to });

  // 3. Push updated receipts
  await push();
}
