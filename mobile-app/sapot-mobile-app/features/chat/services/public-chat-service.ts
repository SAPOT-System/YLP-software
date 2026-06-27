import { toAppError } from "@/features/shared/errors";
import { WsSignalingAdapter } from "@/features/shared/connection/adapters/ws-signaling-adapter";
import { UserStore } from "@/features/shared";
import { AppModeStore } from "@/features/shared/stores";
import { chatLog } from "@/features/shared/utils/logger";
import { PublicChatMessage, SendPublicChatPayload } from "../types";
import { fetchPublicChatHistory } from "../api/public-chat.api";

chatLog.debug("[public-chat-service] module loaded");

export class PublicChatService {
  private messages: PublicChatMessage[] = [];
  private listeners = new Set<() => void>();

  private hasLoadedHistory = false;
  private isLoadingHistory = false;
  private hasMoreHistory = true;
  private oldestTimestamp: number | null = null;
  private readonly historyPageSize = 50;

  constructor(private userStore: UserStore, private adapter: WsSignalingAdapter, private appModeStore: AppModeStore) {
    adapter.on("open",           () => this.notify());
    adapter.on("close",          () => this.notify());
    adapter.on("public-message", (data: unknown) => this.handleMessage(data));
  }

  async loadHistory(): Promise<void> {
    if (this.hasLoadedHistory || this.isLoadingHistory) return;
    await this._fetchAndPrepend();
    this.hasLoadedHistory = true;
  }

  async loadMoreHistory(): Promise<void> {
    if (!this.hasLoadedHistory || this.isLoadingHistory || !this.hasMoreHistory) return;
    await this._fetchAndPrepend();
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
      sender_first_name: this.userStore.user.firstName,
      sender_last_name: this.userStore.user.lastName ?? "",
      sender_username: this.userStore.user.username,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false,
    };

    chatLog.debug("public-chat › send", { contentLength: content.length });
    this.adapter.sendMessage(payload);

    const optimistic: PublicChatMessage = {
      id: `local-${Date.now()}`,
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

  getIsLoadingHistory(): boolean {
    return this.isLoadingHistory;
  }

  getHasMoreHistory(): boolean {
    return this.hasMoreHistory;
  }

  get isConnected(): boolean {
    return this.adapter.isConnected;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async _fetchAndPrepend(): Promise<void> {
    this.isLoadingHistory = true;
    this.notify();

    try {
      const res = await fetchPublicChatHistory(
        this.historyPageSize,
        this.oldestTimestamp ?? undefined,
      );

      const mapped: PublicChatMessage[] = res.messages
        .filter((m) => !m.is_deleted)
        .map((m) => {
          const fullName = `${m.sender_first_name ?? ""} ${m.sender_last_name ?? ""}`.trim();
          return {
            id: m.id,
            type: "public-chat" as const,
            content: m.content,
            is_deleted: m.is_deleted,
            sender_id: m.sender_id,
            sender_name: fullName || m.sender_username || undefined,
            received_at: new Date(m.created_at),
          };
        });

      // server returns newest-first; reverse to oldest-first before prepending
      mapped.reverse();
      const historyIdSet = new Set(mapped.map((m) => m.id).filter(Boolean));
      this.messages = this.messages.filter((m) => {
        if (!m.id?.startsWith("local-")) {
          // real-id live message: drop if history already contains it
          return !historyIdSet.has(m.id);
        }
        // local optimistic: drop if history has matching content+sender
        return !mapped.some(
          (h) => h.content === m.content && h.sender_id === m.sender_id
        );
      });
      this.messages = [...mapped, ...this.messages];
      this.oldestTimestamp = res.oldest_created_at;
      this.hasMoreHistory = res.messages.length >= this.historyPageSize;

      chatLog.debug("public-chat › history loaded", {
        count: mapped.length,
        hasMore: this.hasMoreHistory,
      });
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.warn("public-chat › history load failed", appErr);
    } finally {
      this.isLoadingHistory = false;
      this.notify();
    }
  }

  private handleMessage(data: unknown): void {
    try {
      const parsed = data as Record<string, unknown>;

      const fullName = `${parsed.sender_first_name ?? ""} ${parsed.sender_last_name ?? ""}`.trim();
      const msg: PublicChatMessage = {
        id: parsed.id ? String(parsed.id) : undefined,
        type: "public-chat",
        content: String(parsed.content ?? ""),
        is_deleted: Boolean(parsed.is_deleted),
        sender_id: String(parsed.sender_id ?? ""),
        sender_name: fullName || (parsed.sender_username as string) || undefined,
        received_at: new Date(),
      };

      if (msg.sender_id === this.userStore.user.id) return;
      if (msg.is_deleted) return;

      chatLog.debug("public-chat › message received", {
        senderId: msg.sender_id,
      });
      this.messages.push(msg);
      this.notify();
    } catch (error) {
      const appErr = toAppError(error, "network");
      chatLog.warn("public-chat › message parse failed", appErr);
    }
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
