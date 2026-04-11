import { Database } from "@nozbe/watermelondb";
import { synchronize } from "@nozbe/watermelondb/sync";
import SyncLogger from "@nozbe/watermelondb/sync/SyncLogger";

import { PeerService } from "@/features/shared/services/peer-service";
import baseLogger from "@/features/shared/utils/logger";
import {
  pushLocalDataApi,
  sync as syncApi,
  type PushLocalDataRequestBody,
} from "../api/sync.api";

const syncLog = baseLogger.extend("sync");

export type SyncEntity =
  | "conversations"
  | "conversation_participants"
  | "messages"
  | "calls"
  | "call_participants"
  | "message_receipts";

export type SyncOperationType = "create" | "update" | "delete";

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  operation: SyncOperationType;
  payload: EntityLocalPayloadMap[SyncEntity];
  updatedAt: number;
  retries: number;
  nextRetryAt?: number;
  lastError?: string;
}

export interface SyncQueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class InMemorySyncQueueStorage implements SyncQueueStorage {
  private store = new Map<string, string>();

  async getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  async setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

interface SyncServiceParams {
  db: Database;
  storage?: SyncQueueStorage;
  queueKey?: string;
  lastSyncKey?: string;
  peerService: PeerService;
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
  private storage: SyncQueueStorage;
  private queueKey: string;
  private lastSyncKey: string;
  private peerService?: PeerService;
  private isSyncing = false;
  private syncLogger: SyncLogger;

  constructor({
    peerService,
    db,
    storage = new InMemorySyncQueueStorage(),
    queueKey = "sync:queue",
    lastSyncKey = "sync:lastSync",
  }: SyncServiceParams) {
    this.db = db;
    this.storage = storage;
    this.queueKey = queueKey;
    this.lastSyncKey = lastSyncKey;
    this.peerService = peerService;
    this.syncLogger = new SyncLogger(20);
  }

  get syncLogs() {
    return this.syncLogger.logs;
  }

  get formattedSyncLogs() {
    return this.syncLogger.formattedLogs;
  }

  async initialize() {
    await this.syncNow();
  }

  async handleConnectivityChange(isOnline: boolean) {
    if (isOnline) {
      await this.syncNow();
    }
  }

  async enqueueOperation(
    entity: SyncEntity,
    operation: SyncOperationType,
    payload: EntityLocalPayloadMap[SyncEntity]
  ) {
    const queue = await this.loadQueue();
    const opId = `${entity}-${payload.id ?? "no-id"}-${Date.now()}`;
    const mergedPayload = this.applyDeleteFlag(entity, operation, payload);

    const item: SyncQueueItem = {
      id: opId,
      entity,
      operation,
      payload: mergedPayload,
      updatedAt: Date.now(),
      retries: 0,
    };

    queue.push(item);
    await this.saveQueue(queue);

    return item;
  }

  async syncNow() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const log = this.syncLogger.newLog();
      await synchronize({
        database: this.db,
        log,
        pullChanges: async ({ lastPulledAt, schemaVersion }) => {
          syncLog.info("sync › pull start", { lastPulledAt, schemaVersion });

          const { changes, timestamp } = await this.pullFromServer(
            schemaVersion,
            lastPulledAt
          );
          const normalizedChanges = this.normalizePullChanges(changes);
          // await this.ensureConversationParticipantUsers(normalizedChanges);
          await this.setLastSync(timestamp);

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

          return { changes: normalizedChanges, timestamp };
        },
        pushChanges: async ({ changes }) => {
          const pushCounts = {
            conversations:
              changes.conversations.created.length +
              changes.conversations.updated.length +
              changes.conversations.deleted.length,
            conversationParticipants:
              changes.conversation_participants.created.length +
              changes.conversation_participants.updated.length +
              changes.conversation_participants.deleted.length,
            messages:
              changes.messages.created.length +
              changes.messages.updated.length +
              changes.messages.deleted.length,
            calls:
              changes.calls.created.length +
              changes.calls.updated.length +
              changes.calls.deleted.length,
            callParticipants:
              changes.call_participants.created.length +
              changes.call_participants.updated.length +
              changes.call_participants.deleted.length,
            messageReceipts:
              changes.message_receipts.created.length +
              changes.message_receipts.updated.length +
              changes.message_receipts.deleted.length,
          };
          syncLog.debug("sync › push changes", { counts: pushCounts });

          await this.pushToServer(changes as SyncChanges);
        },
      });
    } finally {
      this.isSyncing = false;
    }
  }

  async retryFailedOperations() {
    await this.syncNow();
  }

  private async pullFromServer(
    schemaVersion: number,
    lastPulledAt?: number | null
  ) {
    const res = await syncApi(lastPulledAt ?? 0, schemaVersion);
    return res.data as SyncPullResponse;
  }

  private async pushToServer(changes: SyncChanges) {
    const queue = await this.loadQueue();
    const ready = queue.filter((item) => this.isReadyToRetry(item));
    const lastPulledAt = await this.getLastSync();

    const payload = this.buildPushPayload(changes, ready, lastPulledAt);
    syncLog.debug("sync › push payload", {
      hasChanges: this.hasPayload(payload.changes),
      queued: ready.length,
    });
    if (!this.hasPayload(payload.changes)) return;

    try {
      await pushLocalDataApi(payload);
      const remaining = queue.filter((item) => !ready.includes(item));
      await this.saveQueue(remaining);
    } catch (error) {
      const updatedQueue = queue.map((item) =>
        ready.includes(item)
          ? this.markFailed(item, error instanceof Error ? error.message : "")
          : item
      );
      await this.saveQueue(updatedQueue);
      throw error;
    }
  }

  private buildPushPayload(
    changes: SyncChanges,
    queue: SyncQueueItem[],
    lastPulledAt: number
  ) {
    const payload: PushLocalDataRequestBody = {
      last_pulled_at: lastPulledAt,
      changes: {
        conversations: { created: [], updated: [], deleted: [] },
        conversation_participants: { created: [], updated: [], deleted: [] },
        messages: { created: [], updated: [], deleted: [] },
        calls: { created: [], updated: [], deleted: [] },
        call_participants: { created: [], updated: [], deleted: [] },
        message_receipts: { created: [], updated: [], deleted: [] },
      },
    };

    const append = (
      entity: SyncEntity,
      operation: SyncOperationType,
      record: EntityLocalPayloadMap[SyncEntity]
    ) => {
      switch (entity) {
        case "conversations": {
          const changeSet = payload.changes.conversations;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "conversations",
            record as EntityLocalPayloadMap["conversations"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["conversations"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["conversations"]["updated"][number]
            );
          }
          return;
        }
        case "conversation_participants": {
          const changeSet = payload.changes.conversation_participants;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "conversation_participants",
            record as EntityLocalPayloadMap["conversation_participants"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["conversation_participants"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["conversation_participants"]["updated"][number]
            );
          }
          return;
        }
        case "messages": {
          const changeSet = payload.changes.messages;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "messages",
            record as EntityLocalPayloadMap["messages"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["messages"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["messages"]["updated"][number]
            );
          }
          return;
        }
        case "calls": {
          const changeSet = payload.changes.calls;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "calls",
            record as EntityLocalPayloadMap["calls"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["calls"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["calls"]["updated"][number]
            );
          }
          return;
        }
        case "call_participants": {
          const changeSet = payload.changes.call_participants;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "call_participants",
            record as EntityLocalPayloadMap["call_participants"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["call_participants"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["call_participants"]["updated"][number]
            );
          }
          return;
        }
        case "message_receipts": {
          const changeSet = payload.changes.message_receipts;
          if (operation === "delete") {
            if (record.id) {
              changeSet.deleted.push(record.id.toString());
            }
            return;
          }
          const normalized = this.toServerPayload(
            "message_receipts",
            record as EntityLocalPayloadMap["message_receipts"]
          );
          if (operation === "create") {
            changeSet.created.push(
              normalized as PushLocalDataRequestBody["changes"]["message_receipts"]["created"][number]
            );
          } else {
            changeSet.updated.push(
              normalized as PushLocalDataRequestBody["changes"]["message_receipts"]["updated"][number]
            );
          }
          return;
        }
        default:
          return;
      }
    };

    const addRecords = <E extends SyncEntity>(
      entity: E,
      operation: SyncOperationType,
      records: EntityLocalPayloadMap[E][]
    ) => {
      records.forEach((record) => append(entity, operation, record));
    };

    addRecords("conversations", "create", changes.conversations.created);
    addRecords("conversations", "update", changes.conversations.updated);
    changes.conversations.deleted.forEach((id) =>
      append("conversations", "delete", { id })
    );

    addRecords(
      "conversation_participants",
      "create",
      changes.conversation_participants.created
    );
    addRecords(
      "conversation_participants",
      "update",
      changes.conversation_participants.updated
    );
    changes.conversation_participants.deleted.forEach((id) =>
      append("conversation_participants", "delete", { id })
    );

    addRecords("messages", "create", changes.messages.created);
    addRecords("messages", "update", changes.messages.updated);
    changes.messages.deleted.forEach((id) =>
      append("messages", "delete", { id })
    );

    addRecords("calls", "create", changes.calls.created);
    addRecords("calls", "update", changes.calls.updated);
    changes.calls.deleted.forEach((id) => append("calls", "delete", { id }));

    addRecords(
      "call_participants",
      "create",
      changes.call_participants.created
    );
    addRecords(
      "call_participants",
      "update",
      changes.call_participants.updated
    );
    changes.call_participants.deleted.forEach((id) =>
      append("call_participants", "delete", { id })
    );

    addRecords("message_receipts", "create", changes.message_receipts.created);
    addRecords("message_receipts", "update", changes.message_receipts.updated);
    changes.message_receipts.deleted.forEach((id) =>
      append("message_receipts", "delete", { id })
    );

    queue.forEach((item) => {
      append(item.entity, item.operation, item.payload);
    });

    return payload;
  }

  private hasPayload(payload: SyncChanges) {
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

  private applyDeleteFlag(
    entity: SyncEntity,
    operation: SyncOperationType,
    payload: Record<string, unknown>
  ) {
    if (operation !== "delete") return payload;

    if (entity === "messages" || entity === "conversation_participants") {
      return { ...payload, is_deleted: true };
    }

    return payload;
  }

  private isReadyToRetry(item: SyncQueueItem) {
    if (!item.nextRetryAt) return true;
    return item.nextRetryAt <= Date.now();
  }

  private markFailed(item: SyncQueueItem, message: string) {
    const retries = item.retries + 1;
    const backoffMs = Math.min(Math.pow(2, retries) * 1000, 30000);

    return {
      ...item,
      retries,
      lastError: message,
      nextRetryAt: Date.now() + backoffMs,
    };
  }

  private toCreatedTimestamp(value: string | number) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return parsed;
    }
    return value;
  }
  private toUpdatedTimestamp(value?: string | number) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return parsed;
    }
    return value;
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
          created_at: this.toCreatedTimestamp(item.created_at),
          updated_at: this.toCreatedTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.conversations.updated, (item) => ({
          ...item,
          conversation_type: item.conversation_type,
          type: item.conversation_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toUpdatedTimestamp(item.created_at),
          updated_at: this.toUpdatedTimestamp(item.updated_at),
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
            joined_at: this.toCreatedTimestamp(item.joined_at),
            is_deleted: item.is_deleted ?? false,
            created_at: this.toCreatedTimestamp(item.created_at),
            updated_at: this.toCreatedTimestamp(item.updated_at),
          })
        ),
        updated: mapWithDefaults(
          changes.conversation_participants.updated,
          (item) => ({
            ...item,
            conversation: item.conversation_id,
            user: item.user_id,
            joined_at: this.toUpdatedTimestamp(item.joined_at),
            is_deleted: item.is_deleted ?? false,
            created_at: this.toUpdatedTimestamp(item.created_at),
            updated_at: this.toUpdatedTimestamp(item.updated_at),
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
          created_at: this.toCreatedTimestamp(item.created_at),
          updated_at: this.toCreatedTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.messages.updated, (item) => ({
          ...item,
          conversation: item.conversation_id,
          sender: item.sender_id,
          message_type: item.message_type,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toUpdatedTimestamp(item.created_at),
          updated_at: this.toUpdatedTimestamp(item.updated_at),
        })),
        deleted: changes.messages.deleted,
      },
      calls: {
        created: mapWithDefaults(changes.calls.created, (item) => ({
          ...item,
          conversation: item.conversation_id,
          initiator: item.initiator_id,
          call_type: item.call_type,
          start_time: this.toCreatedTimestamp(item.start_time),
          end_time: this.toCreatedTimestamp(item.end_time),
          is_deleted: item.is_deleted ?? false,
          created_at: this.toCreatedTimestamp(item.created_at),
          updated_at: this.toCreatedTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.calls.updated, (item) => ({
          ...item,
          conversation: item.conversation_id,
          initiator: item.initiator_id,
          call_type: item.call_type,
          start_time: this.toUpdatedTimestamp(item.start_time),
          end_time: this.toUpdatedTimestamp(item.end_time),
          is_deleted: item.is_deleted ?? false,
          created_at: this.toUpdatedTimestamp(item.created_at),
          updated_at: this.toUpdatedTimestamp(item.updated_at),
        })),
        deleted: changes.calls.deleted,
      },
      call_participants: {
        created: mapWithDefaults(changes.call_participants.created, (item) => ({
          ...item,
          call: item.conversation_id,
          user: item.user_id,
          joined_at: this.toCreatedTimestamp(item.joined_at),
          left_at:
            item.left_at !== null
              ? this.toCreatedTimestamp(item.left_at)
              : null,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toCreatedTimestamp(item.created_at),
          updated_at: this.toCreatedTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.call_participants.updated, (item) => ({
          ...item,
          call: item.conversation_id,
          user: item.user_id,
          joined_at: this.toUpdatedTimestamp(item.joined_at),
          left_at:
            item.left_at !== null
              ? this.toUpdatedTimestamp(item.left_at)
              : null,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toUpdatedTimestamp(item.created_at),
          updated_at: this.toUpdatedTimestamp(item.updated_at),
        })),
        deleted: changes.call_participants.deleted,
      },
      message_receipts: {
        created: mapWithDefaults(changes.message_receipts.created, (item) => ({
          ...item,
          message: item.message_id,
          user: item.user_id,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toCreatedTimestamp(item.created_at),
          updated_at: this.toCreatedTimestamp(item.updated_at),
        })),
        updated: mapWithDefaults(changes.message_receipts.updated, (item) => ({
          ...item,
          message: item.message_id,
          user: item.user_id,
          is_deleted: item.is_deleted ?? false,
          created_at: this.toUpdatedTimestamp(item.created_at),
          updated_at: this.toUpdatedTimestamp(item.updated_at),
        })),
        deleted: changes.message_receipts.deleted,
      },
    };
  }

  // private async ensureConversationParticipantUsers(changes: SyncChanges) {
  //   if (!this.peerService) return;

  //   const participants = [
  //     ...changes.conversation_participants.created,
  //     ...changes.conversation_participants.updated,
  //   ];
  //   const userIds = new Set<string>();

  //   for (const participant of participants) {
  //     const userId = participant.user_id;
  //     if (userId) {
  //       userIds.add(userId.toString());
  //     }
  //   }

  //   await Promise.all(
  //     Array.from(userIds).map(async (userId) => {
  //       const existing = await this.peerService?.findPeerById(userId);
  //       if (existing) return;

  //       const results = //TODO: End point for searching user through ID
  //
  //       const matched = results[0];

  //       if (matched) {
  //         await this.peerService?.createUser(
  //           matched.id,
  //           matched.username,
  //           matched.first_name,
  //           matched.last_name
  //         );
  //         return;
  //       }

  //       await this.peerService?.createUser(userId, userId, "Unknown User");
  //     })
  //   );
  // }

  private async loadQueue() {
    const raw = await this.storage.getItem(this.queueKey);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SyncQueueItem[];
    } catch {
      return [];
    }
  }

  private async saveQueue(queue: SyncQueueItem[]) {
    await this.storage.setItem(this.queueKey, JSON.stringify(queue));
  }

  private async getLastSync() {
    const raw = await this.storage.getItem(this.lastSyncKey);
    if (!raw) return 0;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private async setLastSync(timestamp: number) {
    await this.storage.setItem(this.lastSyncKey, String(timestamp));
  }
}
