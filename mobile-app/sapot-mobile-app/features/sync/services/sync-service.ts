import { Database } from "@nozbe/watermelondb";
import { synchronize } from "@nozbe/watermelondb/sync";
import SyncLogger from "@nozbe/watermelondb/sync/SyncLogger";

import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import {
  getSyncLastPulledAt,
  saveSyncLastPulledAt,
} from "@/features/shared/stores/secure-config";
import { syncLog } from "@/features/shared/utils/logger";
import {
  pushLocalDataApi,
  sync as syncApi,
  type PushLocalDataRequestBody,
} from "../api/sync.api";

syncLog.debug("[sync-service] module loaded");

export type SyncEntity =
  | "conversations"
  | "conversation_participants"
  | "messages"
  | "calls"
  | "call_participants"
  | "message_receipts";

interface SyncServiceParams {
  db: Database;
}

interface SyncPullResponse {
  changes: PushLocalDataRequestBody["changes"];
  timestamp: number;
}

type SyncChanges = PushLocalDataRequestBody["changes"];

type ChangeCreated<E extends SyncEntity> =
  PushLocalDataRequestBody["changes"][E]["created"][number];
type TimestampInput = string | number | Date | null | undefined;

export type EntityLocalPayloadMap = {
  conversations: {
    id?: string;
    title?: string | null;
    conversation_type?: ChangeCreated<"conversations">["conversation_type"];
    type?: ChangeCreated<"conversations">["conversation_type"];
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
  conversation_participants: {
    id?: string;
    conversation_id?: string;
    conversation?: string;
    user_id?: string;
    user?: string;
    joined_at?: TimestampInput;
    joinedAt?: TimestampInput;
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
  messages: {
    id?: string;
    conversation_id?: string;
    conversation?: string;
    sender_id?: string;
    sender?: string;
    content?: string;
    message_type?: ChangeCreated<"messages">["message_type"];
    messageType?: ChangeCreated<"messages">["message_type"];
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
  calls: {
    id?: string;
    call_type?: ChangeCreated<"calls">["call_type"];
    callType?: ChangeCreated<"calls">["call_type"];
    status?: ChangeCreated<"calls">["status"];
    start_time?: TimestampInput;
    startTime?: TimestampInput;
    end_time?: TimestampInput;
    endTime?: TimestampInput;
    conversation_id?: string;
    conversation?: string;
    initiator_id?: string;
    initiator?: string;
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
  call_participants: {
    id?: string;
    conversation_id?: string;
    call?: string;
    user_id?: string;
    user?: string;
    joined_at?: TimestampInput;
    joinedAt?: TimestampInput;
    left_at?: TimestampInput;
    leftAt?: TimestampInput;
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
  message_receipts: {
    id?: string;
    status?: ChangeCreated<"message_receipts">["status"];
    message_id?: string;
    message?: string;
    user_id?: string;
    user?: string;
    is_deleted?: boolean;
    isDeleted?: boolean;
    created_at?: TimestampInput;
    createdAt?: TimestampInput;
    updated_at?: TimestampInput;
    updatedAt?: TimestampInput;
  };
};

export class SyncService {
  private db: Database;
  private isSyncing = false;
  private syncLogger: SyncLogger;

  constructor({ db }: SyncServiceParams) {
    this.db = db;
    this.syncLogger = new SyncLogger(20);
    syncLog.info("sync › service constructed", { hasDb: Boolean(db) });
  }

  get syncLogs() {
    return this.syncLogger.logs;
  }

  get formattedSyncLogs() {
    return this.syncLogger.formattedLogs;
  }

  async initialize() {
    syncLog.info("sync › initialize");
    await this.syncNow();
  }

  async handleConnectivityChange(isOnline: boolean) {
    syncLog.info("sync › connectivity", { isOnline });
    if (isOnline) {
      await this.syncNow();
    }
  }

  async syncNow() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      syncLog.info("sync › start");
      const log = this.syncLogger.newLog();
      await synchronize({
        database: this.db,
        log,
        pullChanges: async ({ schemaVersion }) => {
          const lastPulledAt = await getSyncLastPulledAt();
          syncLog.info("sync › pull start", { lastPulledAt, schemaVersion });

          const { changes, timestamp } = await this.pullFromServer(
            schemaVersion,
            lastPulledAt
          );
          const normalizedChanges = this.normalizePullChanges(changes);

          const pullCounts = {
            conversations:
              normalizedChanges.conversations.created.length +
              normalizedChanges.conversations.updated.length +
              normalizedChanges.conversations.deleted.length,
            conversationParticipants:
              normalizedChanges.conversation_participants.created.length +
              normalizedChanges.conversation_participants.updated.length +
              normalizedChanges.conversation_participants.deleted.length,
            messages:
              normalizedChanges.messages.created.length +
              normalizedChanges.messages.updated.length +
              normalizedChanges.messages.deleted.length,
            calls:
              normalizedChanges.calls.created.length +
              normalizedChanges.calls.updated.length +
              normalizedChanges.calls.deleted.length,
            callParticipants:
              normalizedChanges.call_participants.created.length +
              normalizedChanges.call_participants.updated.length +
              normalizedChanges.call_participants.deleted.length,
            messageReceipts:
              normalizedChanges.message_receipts.created.length +
              normalizedChanges.message_receipts.updated.length +
              normalizedChanges.message_receipts.deleted.length,
          };
          syncLog.debug("sync › pull changes", { counts: pullCounts });

          await saveSyncLastPulledAt(timestamp);
          return { changes: normalizedChanges, timestamp };
        },
        pushChanges: async ({ changes }) => {
          const lastPulledAt = await getSyncLastPulledAt();
          syncLog.debug("sync › push changes", { lastPulledAt });
          await this.pushToServer(changes as SyncChanges, lastPulledAt);
        },
      });
      syncLog.info("sync › complete");
    } catch (error) {
      syncLog.error("sync › failed", { error });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  private async pullFromServer(
    schemaVersion: number,
    lastPulledAt?: number | null
  ) {
    const res = await syncApi(lastPulledAt ?? 0, schemaVersion);
    return res.data as SyncPullResponse;
  }

  private async pushToServer(
    changes: SyncChanges,
    lastPulledAt?: number | null
  ) {
    const payload = this.buildPushPayload(changes);
    syncLog.debug("sync › push payload", {
      hasChanges: this.hasPayload(payload),
    });
    if (!this.hasPayload(payload)) return;
    await pushLocalDataApi({
      last_pulled_at: lastPulledAt ?? 0,
      changes: payload,
    });
  }

  private buildPushPayload(
    changes: SyncChanges
  ): PushLocalDataRequestBody["changes"] {
    type C = PushLocalDataRequestBody["changes"];

    const excludedReceiptStatuses = new Set([
      MessageStatusType.SENDING,
      MessageStatusType.NOT_SENT,
      MessageStatusType.SENT,
    ]);

    const excludedMessageIds = new Set<string>();
    for (const r of [
      ...changes.message_receipts.created,
      ...changes.message_receipts.updated,
    ]) {
      const data = r as EntityLocalPayloadMap["message_receipts"];
      if (data.status && excludedReceiptStatuses.has(data.status)) {
        const msgId = data.message_id ?? data.message;
        if (msgId) excludedMessageIds.add(msgId);
      }
    }

    return {
      conversations: {
        created: changes.conversations.created.map((r) =>
          this.toServerPayload("conversations", r)
        ) as C["conversations"]["created"],
        updated: changes.conversations.updated.map((r) =>
          this.toServerPayload("conversations", r)
        ) as C["conversations"]["updated"],
        deleted: changes.conversations.deleted,
      },
      conversation_participants: {
        created: changes.conversation_participants.created.map((r) =>
          this.toServerPayload("conversation_participants", r)
        ) as C["conversation_participants"]["created"],
        updated: changes.conversation_participants.updated.map((r) =>
          this.toServerPayload("conversation_participants", r)
        ) as C["conversation_participants"]["updated"],
        deleted: changes.conversation_participants.deleted,
      },
      messages: {
        created: changes.messages.created
          .filter((r) => !excludedMessageIds.has(r.id as string))
          .map((r) => this.toServerPayload("messages", r)) as C["messages"]["created"],
        updated: changes.messages.updated
          .filter((r) => !excludedMessageIds.has(r.id as string))
          .map((r) => this.toServerPayload("messages", r)) as C["messages"]["updated"],
        deleted: changes.messages.deleted,
      },
      calls: {
        created: changes.calls.created.map((r) =>
          this.toServerPayload("calls", r)
        ) as C["calls"]["created"],
        updated: changes.calls.updated.map((r) =>
          this.toServerPayload("calls", r)
        ) as C["calls"]["updated"],
        deleted: changes.calls.deleted,
      },
      call_participants: {
        created: changes.call_participants.created.map((r) =>
          this.toServerPayload("call_participants", r)
        ) as C["call_participants"]["created"],
        updated: changes.call_participants.updated.map((r) =>
          this.toServerPayload("call_participants", r)
        ) as C["call_participants"]["updated"],
        deleted: changes.call_participants.deleted,
      },
      message_receipts: {
        created: changes.message_receipts.created
          .filter((r) => !excludedReceiptStatuses.has(r.status as MessageStatusType))
          .map((r) => this.toServerPayload("message_receipts", r)) as C["message_receipts"]["created"],
        updated: changes.message_receipts.updated
          .filter((r) => !excludedReceiptStatuses.has(r.status as MessageStatusType))
          .map((r) => this.toServerPayload("message_receipts", r)) as C["message_receipts"]["updated"],
        deleted: changes.message_receipts.deleted,
      },
    };
  }

  private hasPayload(payload: PushLocalDataRequestBody["changes"]) {
    return Object.values(payload).some(
      (items) =>
        items.created.length > 0 ||
        items.updated.length > 0 ||
        items.deleted.length > 0
    );
  }

  private toServerPayload(
    entity: "conversations",
    payload: EntityLocalPayloadMap["conversations"]
  ):
    | PushLocalDataRequestBody["changes"]["conversations"]["created"][number]
    | PushLocalDataRequestBody["changes"]["conversations"]["updated"][number];
  private toServerPayload(
    entity: "conversation_participants",
    payload: EntityLocalPayloadMap["conversation_participants"]
  ):
    | PushLocalDataRequestBody["changes"]["conversation_participants"]["created"][number]
    | PushLocalDataRequestBody["changes"]["conversation_participants"]["updated"][number];
  private toServerPayload(
    entity: "messages",
    payload: EntityLocalPayloadMap["messages"]
  ):
    | PushLocalDataRequestBody["changes"]["messages"]["created"][number]
    | PushLocalDataRequestBody["changes"]["messages"]["updated"][number];
  private toServerPayload(
    entity: "calls",
    payload: EntityLocalPayloadMap["calls"]
  ):
    | PushLocalDataRequestBody["changes"]["calls"]["created"][number]
    | PushLocalDataRequestBody["changes"]["calls"]["updated"][number];
  private toServerPayload(
    entity: "call_participants",
    payload: EntityLocalPayloadMap["call_participants"]
  ):
    | PushLocalDataRequestBody["changes"]["call_participants"]["created"][number]
    | PushLocalDataRequestBody["changes"]["call_participants"]["updated"][number];
  private toServerPayload(
    entity: "message_receipts",
    payload: EntityLocalPayloadMap["message_receipts"]
  ):
    | PushLocalDataRequestBody["changes"]["message_receipts"]["created"][number]
    | PushLocalDataRequestBody["changes"]["message_receipts"]["updated"][number];
  private toServerPayload(
    entity: SyncEntity,
    payload: EntityLocalPayloadMap[SyncEntity]
  ) {
    const toInt = (value: unknown, fallback = 0): number => {
      const n =
        typeof value === "number"
          ? value
          : typeof value === "string"
          ? Number(value)
          : NaN;
      return Number.isFinite(n) ? Math.trunc(n) : fallback;
    };

    switch (entity) {
      case "conversations": {
        const data = payload as EntityLocalPayloadMap["conversations"];
        return {
          id: data.id as string,
          title: (data.title ?? "") as string | null,
          conversation_type: data.conversation_type ?? data.type,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      case "conversation_participants": {
        const data =
          payload as EntityLocalPayloadMap["conversation_participants"];
        return {
          id: data.id,
          conversation_id: data.conversation_id ?? data.conversation,
          user_id: data.user_id ?? data.user,
          joined_at: toInt(data.joined_at ?? data.joinedAt),
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      case "messages": {
        const data = payload as EntityLocalPayloadMap["messages"];
        return {
          id: data.id as string,
          conversation_id: data.conversation_id ?? data.conversation,
          sender_id: data.sender_id ?? data.sender,
          message_type: data.message_type ?? data.messageType,
          content: data.content as string,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      case "calls": {
        const data = payload as EntityLocalPayloadMap["calls"];
        return {
          id: data.id as string,
          call_type: data.call_type ?? data.callType,
          status: data.status,
          start_time: toInt(data.start_time ?? data.startTime),
          end_time: toInt(data.end_time ?? data.endTime),
          conversation_id: data.conversation_id ?? data.conversation,
          initiator_id: data.initiator_id ?? data.initiator,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      case "call_participants": {
        const data = payload as EntityLocalPayloadMap["call_participants"];
        return {
          id: data.id as string,
          conversation_id: data.conversation_id ?? data.call,
          user_id: data.user_id ?? data.user,
          joined_at: toInt(data.joined_at ?? data.joinedAt),
          left_at: toInt(data.left_at ?? data.leftAt),
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      case "message_receipts": {
        const data = payload as EntityLocalPayloadMap["message_receipts"];
        return {
          id: data.id as string,
          status: data.status,
          message_id: data.message_id ?? data.message,
          user_id: data.user_id ?? data.user,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at: toInt(data.created_at ?? data.createdAt),
          updated_at: toInt(data.updated_at ?? data.updatedAt),
        };
      }
      default:
        return payload;
    }
  }

  private toTimestamp(value?: string | number | null): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value);
    return 0;
  }

  private normalizePullChanges(changes: SyncChanges) {
    const mapWithDefaults = <T>(items: T[], mapper: (item: T) => T) =>
      items.map((item) => mapper(item));

    return {
      conversations: {
        created: mapWithDefaults(changes.conversations.created, (item) => ({
          ...item,
          conversation_type: item.conversation_type,
          type: item.conversation_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.conversations.updated, (item) => ({
          ...item,
          conversation_type: item.conversation_type,
          type: item.conversation_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.conversations.deleted,
      },
      conversation_participants: {
        created: mapWithDefaults(
          changes.conversation_participants.created,
          (item) => ({
            ...item,
            conversation: item.conversation_id,
            user: item.user_id,
            joined_at: this.toTimestamp(item.joined_at),
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })
        ),
        updated: mapWithDefaults(
          changes.conversation_participants.updated,
          (item) => ({
            ...item,
            conversation: item.conversation_id,
            user: item.user_id,
            joined_at: this.toTimestamp(item.joined_at),
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })
        ),
        deleted: changes.conversation_participants.deleted,
      },
      messages: {
        created: mapWithDefaults(changes.messages.created, (item) => ({
          ...item,
          conversation: item.conversation_id,
          sender: item.sender_id,
          message_type: item.message_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.messages.updated, (item) => ({
          ...item,
          conversation: item.conversation_id,
          sender: item.sender_id,
          message_type: item.message_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.messages.deleted,
      },
      calls: {
        created: mapWithDefaults(changes.calls.created, (item) => ({
          ...item,
          conversation: item.conversation_id,
          initiator: item.initiator_id,
          call_type: item.call_type,
          start_time: this.toTimestamp(item.start_time),
          end_time: this.toTimestamp(item.end_time),
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.calls.updated, (item) => ({
          ...item,
          conversation: item.conversation_id,
          initiator: item.initiator_id,
          call_type: item.call_type,
          start_time: this.toTimestamp(item.start_time),
          end_time: this.toTimestamp(item.end_time),
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.calls.deleted,
      },
      call_participants: {
        created: mapWithDefaults(changes.call_participants.created, (item) => ({
          ...item,
          call: item.conversation_id,
          user: item.user_id,
          joined_at: this.toTimestamp(item.joined_at),
          left_at:
            item.left_at !== null ? this.toTimestamp(item.left_at) : null,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.call_participants.updated, (item) => ({
          ...item,
          call: item.conversation_id,
          user: item.user_id,
          joined_at: this.toTimestamp(item.joined_at),
          left_at:
            item.left_at !== null ? this.toTimestamp(item.left_at) : null,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.call_participants.deleted,
      },
      message_receipts: {
        created: mapWithDefaults(changes.message_receipts.created, (item) => ({
          ...item,
          message: item.message_id,
          user: item.user_id,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.message_receipts.updated, (item) => ({
          ...item,
          message: item.message_id,
          user: item.user_id,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.message_receipts.deleted,
      },
    };
  }
}
