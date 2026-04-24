import { UserStore } from "@/features/shared";
import { chatLog } from "@/features/shared/utils/logger";
import { PublicChatMessage, SendPublicChatPayload } from "../types";

chatLog.debug("[public-chat-service] module loaded");

const RECONNECT_DELAY_MS = 3000;

export class PublicChatService {
  private ws: WebSocket | null = null;
  private messages: PublicChatMessage[] = [];
  private listeners = new Set<() => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private wsUrl = "";
  private token = "";

  constructor(private userStore: UserStore) {}

  connect(wsUrl: string, token: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      chatLog.debug("public-chat › connect skipped", { reason: "already open" });
      return;
    }

    chatLog.info("public-chat › connect", { wsUrl });
    this.stopped = false;
    this.wsUrl = wsUrl;
    this.token = token;
    this.openSocket();
  }

  disconnect(): void {
    chatLog.info("public-chat › disconnect");
    this.stopped = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, "client_stopped");
      this.ws = null;
    }
  }

  sendMessage(content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      chatLog.warn("public-chat › send failed", { reason: "ws not open" });
      return;
    }

    const payload: SendPublicChatPayload = {
      type: "public-chat",
      content,
      from: this.userStore.user.id,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false,
    };

    chatLog.debug("public-chat › send", { contentLength: content.length });
    this.ws.send(JSON.stringify(payload));

    const optimistic: PublicChatMessage = {
      type: "public-chat",
      content,
      is_deleted: false,
      sender_id: this.userStore.user.id,
      received_at: new Date(),
    };
    this.messages.push(optimistic);
    this.notify();
  }

  getMessages(): PublicChatMessage[] {
    return [...this.messages];
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private openSocket(): void {
    if (this.stopped) return;

    const url = this.buildUrl();
    chatLog.info("public-chat › ws open", { url: url.replace(/token=[^&]+/, "token=<redacted>") });
    const ws = new WebSocket(url);

    ws.onopen = () => {
      chatLog.info("public-chat › ws connected");
      this.notify();
    };

    ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    ws.onerror = (event) => {
      chatLog.warn("public-chat › ws error", { event });
      ws.close();
    };

    ws.onclose = (event) => {
      this.ws = null;
      chatLog.warn("public-chat › ws closed", {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      });
      this.notify();
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    };

    this.ws = ws;
  }

  private handleMessage(data: unknown): void {
    try {
      if (typeof data !== "string") return;

      const parsed = JSON.parse(data) as Record<string, unknown>;

      if (parsed.type !== "public-chat") return;

      const msg: PublicChatMessage = {
        type: "public-chat",
        content: String(parsed.content ?? ""),
        is_deleted: Boolean(parsed.is_deleted),
        sender_id: String(parsed.sender_id ?? ""),
        received_at: new Date(),
      };

      if (msg.sender_id === this.userStore.user.id) return;
      if (msg.is_deleted) return;

      chatLog.debug("public-chat › message received", { senderId: msg.sender_id });
      this.messages.push(msg);
      this.notify();
    } catch {
      chatLog.warn("public-chat › message parse failed");
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    chatLog.info("public-chat › reconnect scheduled", { delayMs: RECONNECT_DELAY_MS });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      chatLog.info("public-chat › reconnect attempt");
      this.openSocket();
    }, RECONNECT_DELAY_MS);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  private buildUrl(): string {
    const base = this.wsUrl.replace(/\/+$/, "");
    const wsBase = base.startsWith("http://")
      ? `ws://${base.slice("http://".length)}`
      : base.startsWith("https://")
      ? `wss://${base.slice("https://".length)}`
      : base;
    return `${wsBase}/ws/?token=${encodeURIComponent(this.token)}`;
  }
}
