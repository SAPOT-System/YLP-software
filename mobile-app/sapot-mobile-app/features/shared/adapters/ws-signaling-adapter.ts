import EventEmitter from "events";
import { SignalingMessage } from "../types";

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
  targetId?: string;
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
  type: SignalingMessage["type"];
  targetId?: string;
}

/**
 * WsSignalingAdapter handles websocket signaling for WebRTC negotiation.
 * It provides automatic reconnect, outbound queueing, and event-based message delivery.
 */
export class WsSignalingAdapter extends EventEmitter {
  private socket?: WsLike;
  private state: AdapterState = "idle";
  private currentTargetId?: string;
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

  private readonly logPrefix = "[WsSignalingAdapter]";

  /**
   * Opens a websocket connection using the provided options.
   */
  connect(options: ConnectOptions): Promise<void> {
    try {
      if (
        this.state === "connecting" &&
        this.connectPromise &&
        this.currentTargetId === options.targetId
      ) {
        console.log(
          `${this.logPrefix}: Reusing in-flight websocket connection attempt`,
          {
            targetId: options.targetId,
          }
        );
        return this.connectPromise;
      }

      if (
        this.state === "open" &&
        this.socket?.readyState === this.getWebSocketCtor().OPEN &&
        this.currentTargetId === options.targetId
      ) {
        console.log(
          `${this.logPrefix}: Websocket already open for target, skipping connect`,
          {
            targetId: options.targetId,
          }
        );
        return Promise.resolve();
      }

      this.lastConnectOptions = options;
      this.manuallyClosed = false;
      this.clearReconnectTimer();
      this.clearHeartbeatTimer();
      this.clearHeartbeatTimeoutTimer();

      if (
        this.socket &&
        (this.state === "connecting" || this.state === "open") &&
        this.currentTargetId !== options.targetId
      ) {
        console.log(`${this.logPrefix}: Closing stale websocket before reconnect`, {
          previousTargetId: this.currentTargetId,
          newTargetId: options.targetId,
        });
        this.state = "closing";
        this.socket.close(1000, "switch_target");
      }

      const wsUrl = this.buildWsUrl(options);
      console.log(`${this.logPrefix}: Connecting websocket`, {
        url: this.redactUrl(wsUrl),
        hasTargetId: Boolean(options.targetId),
        autoReconnect: options.autoReconnect !== false,
        reconnectAttempts: this.reconnectAttempts,
      });

      const socket = new (this.getWebSocketCtor())(wsUrl);
      this.socket = socket;
      this.currentTargetId = options.targetId;
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
          console.log(`${this.logPrefix}: Websocket connection opened`);
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
          console.warn(`${this.logPrefix}: WebSocket transport error`, event);
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
          console.warn(`${this.logPrefix}: Websocket closed`, {
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
  sendMessage(message: SignalingMessage) {
    const payload = JSON.stringify(message);
    const summary = this.summarizeSignalingMessage(message);

    if (this.socket?.readyState === this.getWebSocketCtor().OPEN) {
      console.log(`${this.logPrefix}: Sending signaling message`, summary);
      this.socket.send(payload);
      return;
    }

    console.log(`${this.logPrefix}: Queueing signaling message`, {
      ...summary,
      queueSizeBefore: this.outboundQueue.length,
    });
    this.enqueueMessage({
      payload,
      createdAt: Date.now(),
      type: message.type,
      targetId: message.data.to,
    });
  }

  /**
   * Closes the websocket and disables auto-reconnect for this disconnect cycle.
   */
  disconnect(code = 1000, reason = "client_closed") {
    console.log(`${this.logPrefix}: Disconnect requested`, {
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

  isConnectingTo(targetId?: string) {
    return this.state === "connecting" && this.currentTargetId === targetId;
  }

  private handleIncomingMessage(rawData: unknown) {
    try {
      if (typeof rawData !== "string") {
        console.warn(
          `${this.logPrefix}: Received non-string websocket message payload`,
          { payloadType: typeof rawData }
        );
        this.emit("raw-message", rawData);
        return;
      }

      console.log(`${this.logPrefix}: Received websocket payload`, {
        length: rawData.length,
      });
      const parsed = JSON.parse(rawData);

      if (this.isControlMessage(parsed, "pong")) {
        this.clearHeartbeatTimeoutTimer();
        return;
      }

      if (this.isControlMessage(parsed, "ping")) {
        this.sendControlMessage("pong");
        return;
      }

      if (!this.isSignalingMessage(parsed)) {
        console.warn(
          `${this.logPrefix}: Incoming payload is not signaling data`
        );
        this.emit("raw-message", rawData);
        return;
      }

      console.log(
        `${this.logPrefix}: Received signaling message`,
        this.summarizeSignalingMessage(parsed)
      );
      this.emit("message", parsed);
    } catch {
      console.warn(
        `${this.logPrefix}: Failed to parse incoming websocket payload as JSON`
      );
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

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== this.getWebSocketCtor().OPEN)
      return;
    if (this.outboundQueue.length === 0) return;

    const now = Date.now();
    const targetId = this.currentTargetId;
    const freshQueue = this.outboundQueue.filter((item) => {
      const isExpired = now - item.createdAt > this.queueTtlMs;
      const targetMismatch =
        Boolean(targetId) && Boolean(item.targetId) && item.targetId !== targetId;
      return !isExpired && !targetMismatch;
    });

    const droppedCount = this.outboundQueue.length - freshQueue.length;

    console.log(`${this.logPrefix}: Flushing queued signaling messages`, {
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
      console.warn(
        `${this.logPrefix}: Reconnect skipped because no previous options exist`
      );
      return;
    }
    if (options.autoReconnect === false) {
      console.log(
        `${this.logPrefix}: Reconnect disabled, skipping reconnect attempt`
      );
      return;
    }

    const maxAttempts = options.maxReconnectAttempts ?? 8;
    if (this.reconnectAttempts >= maxAttempts) {
      console.error(`${this.logPrefix}: Reconnect exhausted`, {
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
    console.warn(`${this.logPrefix}: Scheduling reconnect`, {
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
        console.log(
          `${this.logPrefix}: Reconnect timer fired but socket is manually closed`
        );
        return;
      }

      console.log(`${this.logPrefix}: Executing reconnect attempt`, {
        attempt: this.reconnectAttempts,
      });
      void this.connect(options);
    }, backoffDelay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    console.log(`${this.logPrefix}: Clearing reconnect timer`);
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
        console.warn(`${this.logPrefix}: Heartbeat timeout, closing socket`);
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
    this.currentTargetId = undefined;
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

  private redactUrl(url: string) {
    return url.replace(/([?&]token=)[^&]*/i, "$1<redacted>");
  }

  private buildWsUrl(options: ConnectOptions) {
    const path = options.path ?? "/ws/";
    const normalizedBase = this.normalizeBaseUrl(options.baseUrl);
    const query: Record<string, string | number | boolean | undefined> = {
      token: options.token,
      target_id: options.targetId,
      ...options.extraQuery,
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
