import EventEmitter from "events";
import { SendPublicChatPayload } from "@/features/chat/types";
import {
  AckMessage,
  CallMessage,
  ChatMessage,
  ServerAckMessage,
  SignalingMessage,
} from "../types";
import { wsLog } from "../utils/logger";
import { encryptSignalingPayload, decryptSignalingPayload, WsEncryptionContext, WsEncryptedPayload } from "../services/ws-encryption";
import { SignedCredential } from "../services/peer-key-service";

interface EncryptedSignalingWireMessage {
  type: 'offer' | 'answer' | 'ice-candidate';
  data: {
    to: string;
    sender: string;
    enc: WsEncryptedPayload;
    /**
     * Credential carried in plaintext alongside the encrypted envelope so the
     * receiver can bootstrap its copy of the sender's ECDH key before decrypting.
     */
    credential?: SignedCredential;
  };
}

wsLog.debug("[ws-signaling-adapter] module loaded");

interface WsLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
}

interface WsConstructor {
  new (url: string): WsLike;
  OPEN: number;
}

interface ConnectOptions {
  baseUrl: string;
  token: string;
  path?: string;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  extraQuery?: Record<string, string | number | boolean | undefined>;
}

type AdapterState = "idle" | "connecting" | "open" | "closing";

interface QueuedSignalingMessage {
  payload: string;
  createdAt: number;
  type: string;
}

/**
 * WsSignalingAdapter handles websocket signaling for WebRTC negotiation.
 * It provides automatic reconnect, outbound queueing, and event-based message delivery.
 */
export class WsSignalingAdapter extends EventEmitter {
  private socket?: WsLike;
  private state: AdapterState = "idle";
  private socketEpoch = 0;

  private outboundQueue: QueuedSignalingMessage[] = [];
  private readonly maxQueueSize = 100;
  private readonly queueTtlMs = 20000;

  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;

  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private heartbeatTimeoutTimer?: ReturnType<typeof setTimeout>;

  private manuallyClosed = false;
  private lastConnectOptions?: ConnectOptions;
  private connectPromise?: Promise<void>;
  private pendingConnectReject?: (error: Error) => void;

  private encryptionCtx?: WsEncryptionContext;
  // Stores original SignalingMessage objects (not pre-serialized) so they can be
  // re-encrypted with the correct peer key when it becomes available at flush time.
  private pendingIce: Map<string, { message: SignalingMessage; createdAt: number }[]> = new Map();

  setEncryptionContext(ctx: WsEncryptionContext): void {
    this.encryptionCtx = ctx;
  }

  /**
   * Opens a websocket connection using the provided options.
   */
  connect(options: ConnectOptions): Promise<void> {
    try {
      if (this.state === "connecting" && this.connectPromise) {
        wsLog.debug("ws › connect reuse pending");
        return this.connectPromise;
      }

      if (
        this.state === "open" &&
        this.socket?.readyState === this.getWebSocketCtor().OPEN
      ) {
        wsLog.debug("ws › connect skipped", { reason: "already open" });
        return Promise.resolve();
      }

      this.lastConnectOptions = options;
      this.manuallyClosed = false;
      this.clearReconnectTimer();
      this.clearHeartbeatTimer();
      this.clearHeartbeatTimeoutTimer();

      if (
        this.socket &&
        (this.state === "connecting" || this.state === "open")
      ) {
        wsLog.info("ws › close stale connection");
        this.state = "closing";
        this.socket.close(1000, "switch_target");
      }

      const wsUrl = this.buildWsUrl(options);
      wsLog.info("ws › connect start", {
        autoReconnect: options.autoReconnect !== false,
        reconnectAttempts: this.reconnectAttempts,
        hasToken: Boolean(options.token),
      });

      const socket = new (this.getWebSocketCtor())(wsUrl);
      this.socket = socket;
      this.state = "connecting";
      const socketEpoch = ++this.socketEpoch;

      this.connectPromise = new Promise<void>((resolve, reject) => {
        this.pendingConnectReject = reject;

        const finalizeConnect = () => {
          this.connectPromise = undefined;
          this.pendingConnectReject = undefined;
        };

        const rejectConnect = (error: Error) => {
          if (this.state === "idle" || this.state === "open") return;
          finalizeConnect();
          reject(error);
        };

        socket.onopen = () => {
          if (!this.isCurrentSocket(socket, socketEpoch)) return;
          this.reconnectAttempts = 0;
          this.state = "open";
          wsLog.info("ws › open");
          this.emit("open");
          this.flushQueue();
          this.startHeartbeat(options);
          finalizeConnect();
          resolve();
        };

        socket.onmessage = (event) => {
          if (!this.isCurrentSocket(socket, socketEpoch)) return;
          this.handleIncomingMessage(event.data);
        };

        socket.onerror = (event) => {
          if (!this.isCurrentSocket(socket, socketEpoch)) return;
          wsLog.warn("ws › transport error", { error: event });
          this.emit("ws-error", event);
          if (this.state === "connecting") {
            rejectConnect(new Error("[WsSignalingAdapter]: WebSocket error"));
          }
        };

        socket.onclose = (event) => {
          if (!this.isCurrentSocket(socket, socketEpoch)) return;
          this.clearHeartbeatTimer();
          this.clearHeartbeatTimeoutTimer();
          this.socket = undefined;
          this.state = "idle";
          wsLog.warn("ws › closed", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            manuallyClosed: this.manuallyClosed,
          });
          this.emit("close", {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });

          if (!event.wasClean) {
            rejectConnect(
              new Error(
                `[WsSignalingAdapter]: WebSocket closed with code ${event.code}`
              )
            );
          }

          if (this.manuallyClosed) return;
          this.tryReconnect();
        };
      });

      return this.connectPromise;
    } catch (error) {
      this.connectPromise = undefined;
      this.pendingConnectReject = undefined;
      this.emit("ws-error", error);
      throw error;
    }
  }

  /**
   * Sends a signaling payload. If socket is not open yet, the payload is queued.
   */
  sendMessage(
    message:
      | SignalingMessage
      | CallMessage
      | SendPublicChatPayload
      | ChatMessage
      | AckMessage
  ) {
    if (
      this.encryptionCtx &&
      this.isSignalingMessage(message) &&
      (message.type === "offer" ||
        message.type === "answer" ||
        message.type === "ice-candidate")
    ) {
      const toPeerId = message.data.to;
      const enc = encryptSignalingPayload(
        message.data,
        toPeerId,
        this.encryptionCtx
      );
      if (!enc) {
        if (message.type === "ice-candidate") {
          // Queue the original message object — it will be re-encrypted at flush
          // time once the peer's key has arrived via their answer credential.
          const existing = this.pendingIce.get(toPeerId) ?? [];
          existing.push({ message, createdAt: Date.now() });
          this.pendingIce.set(toPeerId, existing);
          wsLog.debug("ws-signaling › ICE candidate queued pending peer key", { peerId: toPeerId });
          return;
        }
        // Peer key not yet known for offer/answer — expected on first contact.
        // The credential embedded in the offer bootstraps the key exchange; the
        // remote peer's key only arrives when their answer credential is processed.
        // Fall through to the plaintext sender below so the credential is delivered.
        wsLog.debug(
          `ws-signaling › ${message.type} sent unencrypted (peer key not yet known, bootstrapping)`,
          { peerId: toPeerId }
        );
      } else {
        // Encryption succeeded — build encrypted wire message.
        // The credential is also included in plaintext alongside enc so the receiver
        // can bootstrap their copy of our ECDH key before attempting decryption.
        const credential = (message.data as { credential?: SignedCredential }).credential;
        const outgoing: EncryptedSignalingWireMessage = {
          type: message.type as 'offer' | 'answer' | 'ice-candidate',
          data: {
            to: toPeerId,
            sender: message.data.sender,
            enc,
            ...(credential ? { credential } : {}),
          },
        };
        const serialized = JSON.stringify(outgoing);
        if (this.socket?.readyState === this.getWebSocketCtor().OPEN) {
          this.socket.send(serialized);
        } else {
          this.enqueueMessage({ payload: serialized, createdAt: Date.now(), type: message.type });
        }
        return;
      }
    }

    // No encryption context — send as-is (legacy/guest mode)
    const payload = JSON.stringify(message);
    if (this.socket?.readyState === this.getWebSocketCtor().OPEN) {
      this.socket.send(payload);
      return;
    }
    this.enqueueMessage({
      payload,
      createdAt: Date.now(),
      type: message.type,
    });
  }

  private flushPendingIce(peerId: string): void {
    const queue = this.pendingIce.get(peerId);
    if (!queue || queue.length === 0) return;
    const now = Date.now();
    const valid = queue.filter(q => now - q.createdAt < this.queueTtlMs);
    wsLog.debug(`ws-signaling › flushing ${valid.length} pending ICE candidates for ${peerId} (encrypted)`);
    for (const item of valid) {
      // Re-encrypt now that the peer key is available.
      const enc = this.encryptionCtx
        ? encryptSignalingPayload(item.message.data, peerId, this.encryptionCtx)
        : null;
      let payload: string;
      if (enc) {
        const outgoing: EncryptedSignalingWireMessage = {
          type: 'ice-candidate',
          data: { to: peerId, sender: item.message.data.sender, enc },
        };
        payload = JSON.stringify(outgoing);
      } else {
        // Fallback — should not happen since we only flush after key becomes known.
        wsLog.warn('ws-signaling › ICE flush encryption failed, sending plaintext', { peerId });
        payload = JSON.stringify(item.message);
      }
      if (this.socket?.readyState === this.getWebSocketCtor().OPEN) {
        this.socket.send(payload);
      } else {
        this.outboundQueue.push({ payload, createdAt: item.createdAt, type: 'ice-candidate' });
      }
    }
    this.pendingIce.delete(peerId);
  }

  notifyPeerKeyAvailable(peerId: string): void {
    this.flushPendingIce(peerId);
  }

  sendGetActiveUsers() {
    if (this.socket?.readyState !== this.getWebSocketCtor().OPEN) return;
    this.socket.send(JSON.stringify({ type: "get-active-users" }));
  }

  /**
   * Closes the websocket and disables auto-reconnect for this disconnect cycle.
   */
  disconnect(code = 1000, reason = "client_closed") {
    wsLog.info("ws › disconnect requested", {
      code,
      reason,
      hadSocket: Boolean(this.socket),
    });

    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    this.clearHeartbeatTimeoutTimer();

    if (this.pendingConnectReject) {
      this.pendingConnectReject(
        new Error("[WsSignalingAdapter]: WebSocket disconnected by client")
      );
      this.pendingConnectReject = undefined;
      this.connectPromise = undefined;
    }

    if (this.socket) {
      this.state = "closing";
      this.socket.close(code, reason);
      this.socket = undefined;
    }

    this.state = "idle";
    this.resetSessionState();
  }

  /**
   * Returns true when websocket is in OPEN state.
   */
  get isConnected() {
    return this.socket?.readyState === this.getWebSocketCtor().OPEN;
  }

  get connectionState() {
    return this.state;
  }

  isConnecting() {
    return this.state === "connecting";
  }

  private handleIncomingMessage(rawData: unknown) {
    try {
      if (typeof rawData !== "string") {
        wsLog.warn("ws › payload non-string", {
          payloadType: typeof rawData,
        });
        this.emit("raw-message", rawData);
        return;
      }

      wsLog.debug("ws › payload received", { length: rawData.length });
      const parsed = JSON.parse(rawData);

      if (this.isControlMessage(parsed, "pong")) {
        wsLog.debug("ws › pong received");
        this.clearHeartbeatTimeoutTimer();
        return;
      }

      if (this.isControlMessage(parsed, "ping")) {
        this.sendControlMessage("pong");
        return;
      }

      // Decrypt signaling payload if encrypted
      if (
        this.encryptionCtx &&
        parsed &&
        typeof parsed === "object" &&
        (parsed as { type?: unknown }).type !== undefined &&
        ["offer", "answer", "ice-candidate"].includes(
          (parsed as { type: string }).type
        )
      ) {
        const msg = parsed as {
          type: string;
          data?: { to?: string; sender?: string; enc?: WsEncryptedPayload; credential?: SignedCredential };
        };
        if (msg.data?.enc && msg.data.sender) {
          const sender = msg.data.sender;

          // The credential is carried in plaintext alongside enc so the receiver can
          // bootstrap the sender's ECDH key BEFORE attempting decryption.
          if (msg.data.credential?.ecdhPublicKey && this.encryptionCtx.storePeerKey) {
            this.encryptionCtx.storePeerKey(sender, msg.data.credential.ecdhPublicKey);
            // Flush any ICE candidates we queued while waiting for this key.
            this.flushPendingIce(sender);
          }

          const decrypted = decryptSignalingPayload(
            msg.data.enc,
            sender,
            this.encryptionCtx
          );
          if (!decrypted) {
            wsLog.warn("ws › signaling decryption failed, dropping message", { sender });
            return;
          }
          const reconstructed = { ...msg, data: decrypted };
          if (this.isSignalingMessage(reconstructed)) {
            wsLog.debug("ws › signaling message (decrypted)", this.summarizeSignalingMessage(reconstructed));
            this.emit("message", reconstructed);
            return;
          }
          wsLog.warn("ws › decrypted message has unexpected shape", { type: msg.type });
          return;
        }
      }

      if (this.isDirectChatMessage(parsed)) {
        wsLog.debug("ws › direct chat message", {
          messageId: (parsed as ChatMessage).data?.messageId,
        });
        this.emit("ws-chat", parsed as ChatMessage);
        return;
      }
      if (Array.isArray(parsed)) {
        this.emit("active-users", parsed as string[]);
        return;
      }

      if (this.isCallMessage(parsed)) {
        wsLog.debug("ws › call message", { messageType: parsed.type });
        this.emit("call-message", parsed);
        return;
      }

      if (this.isPublicChatMessage(parsed)) {
        wsLog.debug("ws › public chat message");
        this.emit("public-message", parsed);
        return;
      }

      if (this.isServerAckMessage(parsed)) {
        wsLog.debug("ws › server ack", {
          messageId: (parsed as ServerAckMessage).data.messageId,
          messageType: (parsed as ServerAckMessage).data.message_type,
        });
        this.emit("server-ack", parsed as ServerAckMessage);
        return;
      }

      if (this.isAckMessage(parsed)) {
        wsLog.debug("ws › peer ack", {
          messageId: (parsed as AckMessage).data?.messageId,
        });
        this.emit("ws-ack", parsed as AckMessage);
        return;
      }

      if (!this.isSignalingMessage(parsed)) {
        wsLog.warn("ws › payload not signaling");
        this.emit("raw-message", rawData);
        return;
      }

      // A plaintext signaling message (bootstrapping offer or legacy mode) may
      // carry a credential. Extract it so we have the sender's key before the
      // higher layer tries to send an encrypted answer.
      const ptMsg = parsed as {
        type: string;
        data?: { sender?: string; credential?: SignedCredential };
      };
      if (
        this.encryptionCtx?.storePeerKey &&
        ptMsg.data?.sender &&
        ptMsg.data?.credential?.ecdhPublicKey
      ) {
        const sender = ptMsg.data.sender;
        this.encryptionCtx.storePeerKey(sender, ptMsg.data.credential.ecdhPublicKey);
        wsLog.debug("ws › stored peer key from plaintext credential", { sender });
        this.flushPendingIce(sender);
      }

      wsLog.debug(
        "ws › signaling message",
        this.summarizeSignalingMessage(parsed)
      );
      this.emit("message", parsed);
    } catch {
      wsLog.warn("ws › payload parse failed", { messageType: typeof rawData });
      this.emit("raw-message", rawData);
    }
  }

  private isSignalingMessage(value: unknown): value is SignalingMessage {
    if (!value || typeof value !== "object") return false;

    const candidate = value as {
      type?: unknown;
      data?: unknown;
    };

    if (
      candidate.type !== "offer" &&
      candidate.type !== "answer" &&
      candidate.type !== "ice-candidate" &&
      candidate.type !== "handshake"
    ) {
      return false;
    }

    if (!candidate.data || typeof candidate.data !== "object") return false;

    const data = candidate.data as {
      to?: unknown;
      sender?: unknown;
    };

    if (typeof data.to !== "string") return false;

    if (typeof data.sender === "string") return true;

    return false;
  }

  private isPublicChatMessage(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { type?: unknown };
    return candidate.type === "public-chat";
  }

  private isCallMessage(value: unknown): value is CallMessage {
    if (!value || typeof value !== "object") return false;

    const call = value as {
      type?: unknown;
      data?: unknown;
    };

    if (
      call.type !== "audio-call" &&
      call.type !== "video-call" &&
      call.type !== "call-ended" &&
      call.type !== "call-ready" &&
      call.type !== "call-rejected" &&
      call.type !== "call-missed"
    ) {
      return false;
    }

    if (!call.data || typeof call.data !== "object") return false;

    const data = call.data as {
      from_user?: unknown;
      to?: unknown;
    };

    if (typeof data.to !== "string") return false;

    if (typeof data.from_user === "string") return true;

    return false;
  }

  private isDirectChatMessage(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { type?: unknown; data?: unknown };
    if (candidate.type !== "chat") return false;
    if (!candidate.data || typeof candidate.data !== "object") return false;
    const data = candidate.data as { from?: unknown; from_user?: unknown };
    return typeof data.from === "string" || typeof data.from_user === "string";
  }

  private isAckMessage(value: unknown): value is AckMessage {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { type?: unknown; data?: unknown };
    if (candidate.type !== "ack") return false;
    if (!candidate.data || typeof candidate.data !== "object") return false;
    const data = candidate.data as { messageId?: unknown };
    return typeof data.messageId === "string";
  }

  private isServerAckMessage(value: unknown): value is ServerAckMessage {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { type?: unknown; data?: unknown };
    if (candidate.type !== "server-ack") return false;
    if (!candidate.data || typeof candidate.data !== "object") return false;
    const data = candidate.data as { messageId?: unknown };
    return typeof data.messageId === "string";
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== this.getWebSocketCtor().OPEN)
      return;
    if (this.outboundQueue.length === 0) return;

    const now = Date.now();
    const freshQueue = this.outboundQueue.filter((item) => {
      const isExpired = now - item.createdAt > this.queueTtlMs;
      return !isExpired;
    });

    const droppedCount = this.outboundQueue.length - freshQueue.length;

    wsLog.info("ws › queue flush", {
      queuedMessages: freshQueue.length,
      droppedMessages: droppedCount,
    });

    for (const queued of freshQueue) {
      this.socket.send(queued.payload);
    }

    this.outboundQueue = [];
  }

  private tryReconnect() {
    const options = this.lastConnectOptions;
    if (!options) {
      wsLog.warn("ws › reconnect skipped", { reason: "no options" });
      return;
    }
    if (options.autoReconnect === false) {
      wsLog.info("ws › reconnect disabled");
      return;
    }

    const maxAttempts = options.maxReconnectAttempts ?? 8;
    if (this.reconnectAttempts >= maxAttempts) {
      wsLog.error("ws › reconnect exhausted", {
        attempts: this.reconnectAttempts,
        maxAttempts,
      });
      this.emit("reconnect-failed", {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    const baseDelay = options.reconnectBaseDelayMs ?? 750;
    const maxDelay = options.reconnectMaxDelayMs ?? 10000;
    const baseBackoffDelay = Math.min(
      maxDelay,
      Math.round(baseDelay * Math.pow(1.8, this.reconnectAttempts))
    );
    const jitterFactor = 0.8 + Math.random() * 0.4;
    const backoffDelay = Math.max(
      100,
      Math.round(baseBackoffDelay * jitterFactor)
    );

    this.reconnectAttempts += 1;
    wsLog.warn("ws › reconnect scheduled", {
      attempt: this.reconnectAttempts,
      delayMs: backoffDelay,
    });
    this.emit("reconnecting", {
      attempt: this.reconnectAttempts,
      delayMs: backoffDelay,
    });

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (this.manuallyClosed) {
        wsLog.info("ws › reconnect aborted", { reason: "manual close" });
        return;
      }

      wsLog.info("ws › reconnect attempt", { attempt: this.reconnectAttempts });
      void this.connect(options);
    }, backoffDelay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    wsLog.debug("ws › reconnect timer cleared");
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private startHeartbeat(options: ConnectOptions) {
    const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;
    const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 7000;

    if (heartbeatIntervalMs <= 0 || heartbeatTimeoutMs <= 0) return;

    this.clearHeartbeatTimer();
    this.clearHeartbeatTimeoutTimer();

    this.heartbeatTimer = setInterval(() => {
      if (!this.isConnected) return;

      this.sendControlMessage("ping");
      this.clearHeartbeatTimeoutTimer();
      this.heartbeatTimeoutTimer = setTimeout(() => {
        if (!this.isConnected || !this.socket) return;
        wsLog.warn("ws › heartbeat timeout");
        this.socket.close(4000, "heartbeat_timeout");
      }, heartbeatTimeoutMs);
    }, heartbeatIntervalMs);
  }

  private clearHeartbeatTimer() {
    if (!this.heartbeatTimer) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private clearHeartbeatTimeoutTimer() {
    if (!this.heartbeatTimeoutTimer) return;
    clearTimeout(this.heartbeatTimeoutTimer);
    this.heartbeatTimeoutTimer = undefined;
  }

  private enqueueMessage(message: QueuedSignalingMessage) {
    if (this.outboundQueue.length >= this.maxQueueSize) {
      this.outboundQueue.shift();
    }
    this.outboundQueue.push(message);
  }

  private resetSessionState() {
    this.outboundQueue = [];
    this.reconnectAttempts = 0;
    this.lastConnectOptions = undefined;
  }

  private sendControlMessage(type: "ping" | "pong") {
    if (!this.socket || this.socket.readyState !== this.getWebSocketCtor().OPEN)
      return;

    this.socket.send(JSON.stringify({ type }));
  }

  private isControlMessage(
    value: unknown,
    type: "ping" | "pong"
  ): value is { type: "ping" | "pong" } {
    if (!value || typeof value !== "object") return false;
    const candidate = value as { type?: unknown };
    return candidate.type === type;
  }

  private isCurrentSocket(socket: WsLike, socketEpoch: number) {
    return this.socket === socket && socketEpoch === this.socketEpoch;
  }

  private summarizeSignalingMessage(message: SignalingMessage) {
    return {
      type: message.type,
      to: message.data.to,
      sender: message.data.sender,
    };
  }

  private buildWsUrl(options: ConnectOptions) {
    const path = options.path ?? "/ws/";
    const normalizedBase = this.normalizeBaseUrl(options.baseUrl);
    const query: Record<string, string | number | boolean | undefined> = {
      token: options.token,
    };

    const queryString = Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(
          String(value)
        )}`;
      })
      .join("&");

    return `${normalizedBase}${path}${queryString ? `?${queryString}` : ""}`;
  }

  private normalizeBaseUrl(baseUrl: string) {
    const trimmedBase = baseUrl.replace(/\/+$/, "");

    if (trimmedBase.startsWith("ws://") || trimmedBase.startsWith("wss://")) {
      return trimmedBase;
    }

    if (trimmedBase.startsWith("https://")) {
      return `wss://${trimmedBase.slice("https://".length)}`;
    }

    if (trimmedBase.startsWith("http://")) {
      return `ws://${trimmedBase.slice("http://".length)}`;
    }

    return `ws://${trimmedBase}`;
  }

  private getWebSocketCtor(): WsConstructor {
    const ctor = (globalThis as unknown as { WebSocket?: WsConstructor })
      .WebSocket;

    if (!ctor) {
      throw new Error("[WsSignalingAdapter]: WebSocket is not available");
    }

    return ctor;
  }
}
