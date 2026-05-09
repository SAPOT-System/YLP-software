import { WsSignalingAdapter } from "@/features/shared/adapters/ws-signaling-adapter";
import { UserStore } from "@/features/shared";
import { AppModeStore } from "@/features/shared/stores";
import { chatLog } from "@/features/shared/utils/logger";
import { PublicChatMessage, SendPublicChatPayload } from "../types";

chatLog.debug("[public-chat-service] module loaded");

export class PublicChatService {
  private messages: PublicChatMessage[] = [];
  private listeners = new Set<() => void>();

  constructor(private userStore: UserStore, private adapter: WsSignalingAdapter, private appModeStore: AppModeStore) {
    adapter.on("open",           () => this.notify());
    adapter.on("close",          () => this.notify());
    adapter.on("public-message", (data: unknown) => this.handleMessage(data));
  }

  sendMessage(content: string): void {
    if (!this.appModeStore.isWebSocketAllowed(this.userStore.isGuest)) {
      chatLog.warn("public-chat › send blocked", { reason: "mode" });
      return;
    }
    if (!this.adapter.isConnected) {
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
    this.adapter.sendMessage(payload);

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
    return this.adapter.isConnected;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleMessage(data: unknown): void {
    try {
      const parsed = data as Record<string, unknown>;

      const msg: PublicChatMessage = {
        type: "public-chat",
        content: String(parsed.content ?? ""),
        is_deleted: Boolean(parsed.is_deleted),
        sender_id: String(parsed.sender_id ?? ""),
        received_at: new Date(),
      };

      if (msg.sender_id === this.userStore.user.id) return;
      if (msg.is_deleted) return;

      chatLog.debug("public-chat › message received", {
        senderId: msg.sender_id,
      });
      this.messages.push(msg);
      this.notify();
    } catch {
      chatLog.warn("public-chat › message parse failed");
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
