import { SendPublicChatPayload } from "@/features/chat/types";
import {
  AckMessage,
  CallMessage,
  ChatMessage,
  ServerAckMessage,
  SignalingMessage,
  SmsMessage,
} from "../types";
import { WsEncryptedPayload } from "../crypto/ws-encryption";
import { SignedCredential } from "../crypto/peer-key-service";

export type WsEvent =
  | { kind: "signaling"; message: SignalingMessage; peerCredential?: SignedCredential }
  | { kind: "call"; message: CallMessage }
  | { kind: "chat"; message: ChatMessage }
  | { kind: "sms"; message: SmsMessage }
  | { kind: "ack"; message: AckMessage }
  | { kind: "server-ack"; message: ServerAckMessage }
  | { kind: "public-chat"; message: SendPublicChatPayload }
  | { kind: "active-users"; ids: string[] }
  | { kind: "pong" }
  | { kind: "ping" }
  | { kind: "unknown"; raw: unknown };

export type DecryptFn = (enc: WsEncryptedPayload, sender: string) => object | null;
export type StorePeerKeyFn = (peerId: string, ecdhPublicKeyB64: string) => void;

interface EncryptedWireData {
  to: string;
  sender: string;
  enc: WsEncryptedPayload;
  credential?: SignedCredential;
}

interface EncryptedWireMessage {
  type: "offer" | "answer" | "ice-candidate";
  data: EncryptedWireData;
}

function isControlMessage(value: unknown, type: "ping" | "pong"): boolean {
  if (!value || typeof value !== "object") return false;
  return (value as { type?: unknown }).type === type;
}

function isEncryptedSignaling(value: unknown): value is EncryptedWireMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "offer" && v.type !== "answer" && v.type !== "ice-candidate") return false;
  if (!v.data || typeof v.data !== "object") return false;
  const d = v.data as { enc?: unknown; sender?: unknown };
  return typeof d.sender === "string" && d.enc !== null && typeof d.enc === "object";
}

function isSignalingMessage(value: unknown): value is SignalingMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "offer" && v.type !== "answer" && v.type !== "ice-candidate" && v.type !== "handshake") return false;
  if (!v.data || typeof v.data !== "object") return false;
  const d = v.data as { to?: unknown; sender?: unknown };
  return typeof d.to === "string" && typeof d.sender === "string";
}

function isSmsMessage(value: unknown): value is SmsMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "chat") return false;
  if (!v.data || typeof v.data !== "object") return false;
  const d = v.data as { messageType?: unknown; senderProfile?: unknown };
  return d.messageType === "sms" && typeof d.senderProfile === "object" && d.senderProfile !== null;
}

function isDirectChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "chat") return false;
  if (!v.data || typeof v.data !== "object") return false;
  const d = v.data as { from?: unknown; from_user?: unknown };
  return typeof d.from === "string" || typeof d.from_user === "string";
}

function isCallMessage(value: unknown): value is CallMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  const callTypes = ["audio-call", "video-call", "call-ended", "call-ready", "call-rejected", "call-missed"];
  if (!callTypes.includes(v.type as string)) return false;
  if (!v.data || typeof v.data !== "object") return false;
  const d = v.data as { from?: unknown; to?: unknown };
  return typeof d.from === "string" && typeof d.to === "string";
}

function isPublicChatMessage(value: unknown): value is SendPublicChatPayload {
  if (!value || typeof value !== "object") return false;
  return (value as { type?: unknown }).type === "public-chat";
}

function isServerAckMessage(value: unknown): value is ServerAckMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "server-ack") return false;
  if (!v.data || typeof v.data !== "object") return false;
  return typeof (v.data as { messageId?: unknown }).messageId === "string";
}

function isAckMessage(value: unknown): value is AckMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as { type?: unknown; data?: unknown };
  if (v.type !== "ack") return false;
  if (!v.data || typeof v.data !== "object") return false;
  return typeof (v.data as { messageId?: unknown }).messageId === "string";
}

export function parseWsMessage(raw: string, decrypt?: DecryptFn, storePeerKey?: StorePeerKeyFn): WsEvent {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (isControlMessage(parsed, "pong")) return { kind: "pong" };
    if (isControlMessage(parsed, "ping")) return { kind: "ping" };

    if (Array.isArray(parsed)) return { kind: "active-users", ids: parsed as string[] };

    if (isEncryptedSignaling(parsed)) {
      if (!decrypt) return { kind: "unknown", raw: parsed };
      const sender = parsed.data.sender;
      if (parsed.data.credential?.ecdhPublicKey && storePeerKey) {
        storePeerKey(sender, parsed.data.credential.ecdhPublicKey);
      }
      const decrypted = decrypt(parsed.data.enc, sender);
      if (!decrypted) return { kind: "unknown", raw: parsed };
      const reconstructed = { type: parsed.type, data: decrypted };
      if (isSignalingMessage(reconstructed)) {
        return { kind: "signaling", message: reconstructed, peerCredential: parsed.data.credential };
      }
      return { kind: "unknown", raw: parsed };
    }

    // SMS must be checked before direct-chat (both have type==="chat")
    if (isSmsMessage(parsed)) return { kind: "sms", message: parsed };
    if (isDirectChatMessage(parsed)) return { kind: "chat", message: parsed };
    if (isCallMessage(parsed)) return { kind: "call", message: parsed };
    if (isPublicChatMessage(parsed)) return { kind: "public-chat", message: parsed };
    if (isServerAckMessage(parsed)) return { kind: "server-ack", message: parsed };
    if (isAckMessage(parsed)) return { kind: "ack", message: parsed };

    if (isSignalingMessage(parsed)) {
      const ptMsg = parsed as SignalingMessage & { data: { credential?: SignedCredential } };
      return { kind: "signaling", message: ptMsg, peerCredential: ptMsg.data.credential };
    }

    return { kind: "unknown", raw: parsed };
  } catch {
    return { kind: "unknown", raw };
  }
}
