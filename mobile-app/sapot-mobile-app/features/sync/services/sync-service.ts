import { Database, Q } from "@nozbe/watermelondb";
import { synchronize } from "@nozbe/watermelondb/sync";
import SyncLogger from "@nozbe/watermelondb/sync/SyncLogger";
import { isAxiosError } from "axios";
import { toAppError } from "@/features/shared/errors";
import { CallStatus } from "@/features/shared/database/model/Call";
import { MessageStatusType } from "@/features/shared/database/model/MessageStatus";
import {
  getSyncLastPulledAt,
  saveSyncLastPulledAt,
} from "@/features/shared/stores/secure-config";
import { TypedEventEmitter } from "@/features/shared/utils/typed-event-emitter";
import { syncLog } from "@/features/shared/utils/logger";
import { clearMigrationState } from "@/features/shared/stores/secure-config";
import {
  pushLocalDataApi,
  sync as syncApi,
  type PushLocalDataRequestBody,
  type ServerSyncResponse,
} from "../api/sync.api";
import { PeerHydrator } from "./peer-hydrator";
import { SyncPushFilter } from "./push-filter";
import { MigrationGuard } from "./migration-guard";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import type { PeerService } from "@/features/shared/services/peer-service";
import type { PeerRepository } from "@/features/shared/repositories/peer-repository";
import type { MessageRepository } from "@/features/chat/repositories/message-repository";

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
  messageReceiptManager?: MessageReceiptManager;
  currentUserId?: string;
  peerService?: PeerService;
  peerRepository?: PeerRepository;
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
  /**
   * call_participants FK naming:
   *   WatermelonDB schema column → `call`    (string, stores the call's UUID)
   *   Server column              → `call_id`
   *
   * normalizePullChanges spreads ...item (preserving `call_id`) and adds
   * `call: item.call_id` so WatermelonDB writes to the correct column.
   * toServerPayload reads `data.call_id ?? data.call` and outputs `call_id`
   * as expected by the push endpoint.
   */
  call_participants: {
    id?: string;
    call_id?: string;
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

export type SyncServiceEvents = {
  "sync-status": [
    { status: "started" | "complete" | "failed" | "retrying"; error?: unknown }
  ];
};

export class SyncService extends TypedEventEmitter<SyncServiceEvents> {
  private db: Database;
  private conversationParticipantRepository: ConversationParticipantRepository;
  private currentUserId?: string;
  private peerRepository?: PeerRepository;
  private isSyncing = false;
  private syncLogger: SyncLogger;
  private retryAttempts = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private messageRepository?: MessageRepository;
  private peerHydrator: PeerHydrator;
  private pushFilter: SyncPushFilter;
  private migrationGuard: MigrationGuard;

  constructor({ db, messageReceiptManager, currentUserId, peerService, peerRepository }: SyncServiceParams) {
    super();
    this.db = db;
    this.currentUserId = currentUserId;
    this.peerRepository = peerRepository;
    this.conversationParticipantRepository =
      new ConversationParticipantRepository(this.db);
    this.syncLogger = new SyncLogger(20);
    this.peerHydrator = new PeerHydrator(db, peerService, peerRepository);
    this.pushFilter = new SyncPushFilter(messageReceiptManager);
    this.migrationGuard = new MigrationGuard(db);
    syncLog.info("sync › service constructed", {
      hasDb: Boolean(db),
      hasReceiptManager: Boolean(messageReceiptManager),
    });
  }

  /**
   * Sets the message receipt manager after construction.
   * Used to inject ChatService's manager after MainContainer initialization.
   */
  setMessageReceiptManager(messageReceiptManager: MessageReceiptManager): void {
    this.pushFilter.setMessageReceiptManager(messageReceiptManager);
    syncLog.info("sync › message receipt manager set");
  }

  setPeerService(peerService: PeerService): void {
    this.peerHydrator.setPeerService(peerService);
    syncLog.info("sync › peer service set");
  }

  /** Wired by MainContainer so normalizePullChanges can decrypt server messages
   *  that were encrypted with the guest conversation key during migration. */
  setMessageRepository(repo: MessageRepository): void {
    this.messageRepository = repo;
    syncLog.info("sync › message repository set");
  }

  /**
   * Instructs the next sync pull phase to skip overwriting locally-encrypted
   * messages with server-side ecdh: ciphertext. Called in the migration recovery
   * path to prevent the pull from restoring old guest-key ciphertext over messages
   * that were just re-encrypted with the auth conversation key.
   * The flag is consumed and cleared on the next normalizePullChanges() call.
   */
  skipEncryptedMessageUpdatesOnNextSync(): void {
    this.migrationGuard.scheduleSkip();
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
      this.clearRetryTimer();
      this.retryAttempts = 0;
      await this.syncNow();
    }
  }

  async syncNow() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      syncLog.info("sync › start");
      this.emit("sync-status", { status: "started" });
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
          const normalizedChanges = await this.normalizePullChanges(changes);

          const pullCounts = {
            conversations: {
              received: changes.conversations.created.length,
              filtered:
                changes.conversations.created.length -
                normalizedChanges.conversations.created.length,
              applied: normalizedChanges.conversations.created.length,
              updated: normalizedChanges.conversations.updated.length,
              deleted: normalizedChanges.conversations.deleted.length,
            },
            conversationParticipants: {
              received: changes.conversation_participants.created.length,
              filtered:
                changes.conversation_participants.created.length -
                normalizedChanges.conversation_participants.created.length,
              applied:
                normalizedChanges.conversation_participants.created.length,
              updated:
                normalizedChanges.conversation_participants.updated.length,
              deleted:
                normalizedChanges.conversation_participants.deleted.length,
            },
            messages: {
              received: changes.messages.created.length,
              filtered:
                changes.messages.created.length -
                normalizedChanges.messages.created.length,
              applied: normalizedChanges.messages.created.length,
              updated: normalizedChanges.messages.updated.length,
              deleted: normalizedChanges.messages.deleted.length,
            },
            calls: {
              received: changes.calls.created.length,
              filtered:
                changes.calls.created.length -
                normalizedChanges.calls.created.length,
              applied: normalizedChanges.calls.created.length,
              updated: normalizedChanges.calls.updated.length,
              deleted: normalizedChanges.calls.deleted.length,
            },
            callParticipants: {
              received: changes.call_participants.created.length,
              filtered:
                changes.call_participants.created.length -
                normalizedChanges.call_participants.created.length,
              applied: normalizedChanges.call_participants.created.length,
              updated: normalizedChanges.call_participants.updated.length,
              deleted: normalizedChanges.call_participants.deleted.length,
            },
            messageReceipts: {
              received: changes.message_receipts.created.length,
              filtered:
                changes.message_receipts.created.length -
                normalizedChanges.message_receipts.created.length,
              applied: normalizedChanges.message_receipts.created.length,
              updated: normalizedChanges.message_receipts.updated.length,
              deleted: normalizedChanges.message_receipts.deleted.length,
            },
          };
          syncLog.debug("sync › pull changes", { counts: pullCounts });

          await this.peerHydrator.hydrate(changes);

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

      // Post-migration: re-encrypt any messages that were pulled from the server
      // as plaintext (server-only messages that arrived as ecdh:K_AB in the pull
      // phase and were decrypted by normalizePullChanges). Running this AFTER the
      // full synchronize() call — not inside the pull callback — ensures the
      // snapshot survives 409/retry scenarios and is only cleared on success.
      if (this.messageRepository?.hasMigrationKeys()) {
        syncLog.info("sync › post-migration re-encryption: re-encrypting server-pulled messages");
        await this.messageRepository.reEncryptAfterMigration();
        this.messageRepository.clearMigrationKeys();
        await clearMigrationState();
        syncLog.info("sync › post-migration re-encryption: complete, migration keys cleared");
      }

      this.emit("sync-status", { status: "complete" });
      this.retryAttempts = 0;
      this.clearRetryTimer();
    } catch (error) {
      const appErr = toAppError(error, "sync");
      syncLog.error("sync › failed", appErr);

      if (isAxiosError(error) && error.response?.status === 409) {
        // Conflict: server state moved past our cursor. Reset to 0 so the next
        // sync cycle does a full re-pull from the server.
        syncLog.warn("sync › 409 conflict, resetting lastPulledAt");
        await saveSyncLastPulledAt(0);
        this.emit("sync-status", { status: "failed", error: appErr });

        // Schedule immediate retry to minimize data gap
        this.scheduleRetry();
        return;
      }

      if (isAxiosError(error) && error.response?.status === 404) {
        // Record already deleted on server — push is irrecoverable without re-pulling.
        // Reset lastPulledAt so next sync does a full re-pull to get current server state.
        syncLog.warn("sync › 404 on push (record deleted on server), resetting lastPulledAt");
        await saveSyncLastPulledAt(0);
        this.emit("sync-status", { status: "failed", error: appErr });
        // No scheduleRetry — fresh pull state is needed before pushing again
        return;
      }

      this.emit("sync-status", { status: "failed", error: appErr });
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
    }
  }

  private scheduleRetry(): void {
    const MAX_ATTEMPTS = 5;
    const BASE_MS = 1_000;
    const MAX_MS = 30_000;

    if (this.retryAttempts >= MAX_ATTEMPTS) {
      syncLog.warn("sync › retry exhausted", { attempts: this.retryAttempts });
      this.retryAttempts = 0;
      return;
    }

    const base = Math.min(
      MAX_MS,
      Math.round(BASE_MS * Math.pow(1.8, this.retryAttempts))
    );
    const delay = Math.max(200, Math.round(base * (0.8 + Math.random() * 0.4)));
    this.retryAttempts += 1;
    syncLog.warn("sync › retry scheduled", {
      attempt: this.retryAttempts,
      delayMs: delay,
    });

    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => void this.syncNow(), delay);
    this.emit("sync-status", { status: "retrying" });
  }

  private clearRetryTimer(): void {
    if (!this.retryTimer) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  cleanup(): void {
    this.clearRetryTimer();
    this.removeAllListeners();
    syncLog.info("sync › cleanup");
  }

  private async pullFromServer(
    schemaVersion: number,
    lastPulledAt?: number | null
  ): Promise<{ changes: SyncChanges; timestamp: number }> {
    const entities: (keyof SyncChanges)[] = [
      "conversations",
      "conversation_participants",
      "messages",
      "calls",
      "call_participants",
      "message_receipts",
    ];

    function mergeById<T extends { id?: string }>(
      base: T[],
      incoming: T[]
    ): T[] {
      const map = new Map<string, T>();
      for (const item of base) if (item.id !== undefined) map.set(item.id, item);
      for (const item of incoming) if (item.id !== undefined) map.set(item.id, item);
      return [...base.filter((i) => i.id === undefined), ...map.values()];
    }

    function mergeDeleted(base: string[], incoming: string[]): string[] {
      return [...new Set([...base, ...incoming])];
    }

    let cursor = lastPulledAt ?? 0;
    let finalTimestamp: number | undefined;
    const merged: SyncChanges = {
      conversations: { created: [], updated: [], deleted: [] },
      conversation_participants: { created: [], updated: [], deleted: [] },
      messages: { created: [], updated: [], deleted: [] },
      calls: { created: [], updated: [], deleted: [] },
      call_participants: { created: [], updated: [], deleted: [] },
      message_receipts: { created: [], updated: [], deleted: [] },
    };

    const MAX_ITERATIONS = 50;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      syncLog.debug("sync › pull page", { iteration: i + 1, cursor });
      const res = await syncApi(cursor, schemaVersion);
      const page = res.data as ServerSyncResponse;

      if (finalTimestamp === undefined) finalTimestamp = page.timestamp;

      for (const entity of entities) {
        const pe = page.changes[entity];
        const acc = merged[entity];
        (acc.created as { id?: string }[]) = mergeById(
          acc.created as { id?: string }[],
          pe.created as { id?: string }[]
        );
        (acc.updated as { id?: string }[]) = mergeById(
          acc.updated as { id?: string }[],
          pe.updated as { id?: string }[]
        );
        acc.deleted = mergeDeleted(acc.deleted, pe.deleted);
      }

      const hasMoreEntities = entities.filter((e) => page.changes[e].has_more);
      if (hasMoreEntities.length === 0) break;

      const nextCursors = hasMoreEntities
        .map((e) => page.changes[e].next_cursor)
        .filter((c): c is number => c !== null);

      if (nextCursors.length === 0) {
        syncLog.warn("sync › has_more=true but no valid next_cursor, stopping");
        break;
      }

      cursor = Math.min(...nextCursors);
      syncLog.debug("sync › advancing cursor", {
        cursor,
        hasMoreEntities,
      });
    }

    return { changes: merged, timestamp: finalTimestamp ?? 0 };
  }

  private async pushToServer(
    changes: SyncChanges,
    lastPulledAt?: number | null
  ) {
    const { changes: payload, guest_users } = await this.buildPushPayload(changes);
    syncLog.debug("sync › push payload", {
      hasChanges: this.hasPayload(payload),
    });
    if (!this.hasPayload(payload)) return;
    await pushLocalDataApi({
      last_pulled_at: lastPulledAt ?? 0,
      changes: payload,
      guest_users,
    });
  }

  private async buildPushPayload(
    changes: SyncChanges
  ): Promise<{ changes: PushLocalDataRequestBody["changes"]; guest_users: Record<string, { first_name: string; last_name: string; username: string }> }> {
    type C = PushLocalDataRequestBody["changes"];

    // Build a map of message receipts grouped by message for filtering logic
    const receiptsByMessage = new Map<string, MessageStatusType[]>();
    for (const r of [
      ...changes.message_receipts.created,
      ...changes.message_receipts.updated,
    ]) {
      const data = r as EntityLocalPayloadMap["message_receipts"];
      const msgId = data.message_id ?? data.message;
      if (msgId && data.status) {
        if (!receiptsByMessage.has(msgId)) {
          receiptsByMessage.set(msgId, []);
        }
        receiptsByMessage.get(msgId)!.push(data.status);
      }
    }

    // Determine which messages belong to a self conversation (current user only).
    const selfMessageIds = new Set<string>();
    if (this.currentUserId) {
      const allMessages = [
        ...changes.messages.created,
        ...changes.messages.updated,
      ];
      try {
        const selfConvId =
          await this.conversationParticipantRepository.isSelfConversationExists(
            this.currentUserId
          );
        if (selfConvId) {
          for (const m of allMessages) {
            const data = m as EntityLocalPayloadMap["messages"];
            const convId = (data.conversation_id ?? data.conversation) as
              | string
              | undefined;
            if (convId && convId === selfConvId && data.id) {
              selfMessageIds.add(data.id as string);
            }
          }
        }
      } catch (error) {
        const appErr = toAppError(error, "sync");
        syncLog.warn("sync › self conversation detection failed", appErr);
      }
    }

    const excludedCallIds = new Set<string>();
    for (const r of [...changes.calls.created, ...changes.calls.updated]) {
      const data = r as EntityLocalPayloadMap["calls"];
      if (data.status === CallStatus.INITIATING) {
        if (data.id) excludedCallIds.add(data.id);
      }
    }

    const conversationParticipantsCreated = changes.conversation_participants.created.map(
      (r) => this.toServerPayload("conversation_participants", r)
    ) as C["conversation_participants"]["created"];

    const guest_users: Record<string, { first_name: string; last_name: string; username: string }> = {};
    if (this.peerRepository) {
      const participantUserIds = conversationParticipantsCreated
        .map((p) => p.user_id)
        .filter((id): id is string => Boolean(id));
      if (participantUserIds.length > 0) {
        const peers = await this.peerRepository.getByIds(participantUserIds);
        for (const peer of peers) {
          if (peer.isGuest && peer.firstName) {
            guest_users[peer.id] = {
              first_name: peer.firstName,
              last_name: peer.lastName ?? "",
              username: peer.username,
            };
          }
        }
      }
    }

    return { changes: {
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
        created: conversationParticipantsCreated,
        updated: changes.conversation_participants.updated.map((r) =>
          this.toServerPayload("conversation_participants", r)
        ) as C["conversation_participants"]["updated"],
        deleted: changes.conversation_participants.deleted,
      },
      messages: {
        created: changes.messages.created
          .filter(
            (r) =>
              this.pushFilter.shouldPushMessage(r.id as string, receiptsByMessage) ||
              selfMessageIds.has(r.id as string)
          )
          .map((r) =>
            this.toServerPayload("messages", r)
          ) as C["messages"]["created"],
        updated: changes.messages.updated
          .filter(
            (r) =>
              this.pushFilter.shouldPushMessage(r.id as string, receiptsByMessage) ||
              selfMessageIds.has(r.id as string)
          )
          .map((r) =>
            this.toServerPayload("messages", r)
          ) as C["messages"]["updated"],
        deleted: changes.messages.deleted,
      },
      calls: {
        created: changes.calls.created
          .filter((r) => !excludedCallIds.has(r.id as string))
          .map((r) =>
            this.toServerPayload("calls", r)
          ) as C["calls"]["created"],
        updated: changes.calls.updated
          .filter((r) => !excludedCallIds.has(r.id as string))
          .map((r) =>
            this.toServerPayload("calls", r)
          ) as C["calls"]["updated"],
        deleted: changes.calls.deleted,
      },
      call_participants: {
        created: changes.call_participants.created
          .filter((r) => {
            const data = r as EntityLocalPayloadMap["call_participants"];
            const callId = data.call_id ?? data.call;
            return !callId || !excludedCallIds.has(callId);
          })
          .map((r) =>
            this.toServerPayload("call_participants", r)
          ) as C["call_participants"]["created"],
        updated: changes.call_participants.updated
          .filter((r) => {
            const data = r as EntityLocalPayloadMap["call_participants"];
            const callId = data.call_id ?? data.call;
            return !callId || !excludedCallIds.has(callId);
          })
          .map((r) =>
            this.toServerPayload("call_participants", r)
          ) as C["call_participants"]["updated"],
        deleted: changes.call_participants.deleted,
      },
      message_receipts: {
        created: changes.message_receipts.created
          .map((r) => {
            const rec = r as EntityLocalPayloadMap["message_receipts"];
            const msgId = (rec.message_id ?? rec.message) as string | undefined;
            // For self messages, map SENT -> DELIVERED because server does not store SENT
            if (
              msgId &&
              selfMessageIds.has(msgId) &&
              rec.status === MessageStatusType.SENT
            ) {
              return { ...rec, status: MessageStatusType.DELIVERED };
            }
            return rec;
          })
          .filter((r) => this.pushFilter.shouldPushReceipt(r.status as MessageStatusType))
          .map((r) =>
            this.toServerPayload("message_receipts", r)
          ) as C["message_receipts"]["created"],
        updated: changes.message_receipts.updated
          .map((r) => {
            const rec = r as EntityLocalPayloadMap["message_receipts"];
            const msgId = (rec.message_id ?? rec.message) as string | undefined;
            if (
              msgId &&
              selfMessageIds.has(msgId) &&
              rec.status === MessageStatusType.SENT
            ) {
              return { ...rec, status: MessageStatusType.DELIVERED };
            }
            return rec;
          })
          .filter((r) => this.pushFilter.shouldPushReceipt(r.status as MessageStatusType))
          .map((r) =>
            this.toServerPayload("message_receipts", r)
          ) as C["message_receipts"]["updated"],
        deleted: changes.message_receipts.deleted,
      },
    }, guest_users };
  }

  private hasPayload(payload: PushLocalDataRequestBody["changes"]) {
    return Object.values(payload).some(
      (items) =>
        items.created.length > 0 ||
        items.updated.length > 0 ||
        items.deleted.length > 0
    );
  }

  /**
   * Validates that all required foreign key fields are present and non-null.
   * Logs warnings for debugging and helps catch data corruption early.
   *
   * @param entity The entity type
   * @param id The record ID for logging context
   * @param fkField The FK field value to validate
   * @param fkFieldName The FK field name for logging
   */
  private validateForeignKey(
    entity: string,
    id: string,
    fkField: unknown,
    fkFieldName: string
  ): void {
    if (!fkField) {
      syncLog.warn("sync › missing foreign key", {
        entity,
        recordId: id,
        field: fkFieldName,
        value: fkField,
      });
    }
  }

  /**
   * Validates that a timestamp is a valid finite number.
   * Logs warning if conversion resulted in 0 or invalid value.
   *
   * @param entity The entity type
   * @param id The record ID for logging context
   * @param timestamp The timestamp to validate
   * @param fieldName The field name for logging
   */
  private validateTimestamp(
    entity: string,
    id: string,
    timestamp: number,
    fieldName: string
  ): void {
    if (!Number.isFinite(timestamp) || timestamp === 0) {
      syncLog.warn("sync › invalid timestamp", {
        entity,
        recordId: id,
        field: fieldName,
        value: timestamp,
      });
    }
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
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        this.validateTimestamp(
          entity,
          data.id as string,
          created_at,
          "created_at"
        );
        this.validateTimestamp(
          entity,
          data.id as string,
          updated_at,
          "updated_at"
        );
        return {
          id: data.id as string,
          title: (data.title ?? "") as string | null,
          conversation_type: data.conversation_type ?? data.type,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "conversation_participants": {
        const data =
          payload as EntityLocalPayloadMap["conversation_participants"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const joined_at = toInt(data.joined_at ?? data.joinedAt);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id,
          conversation_id,
          user_id,
          joined_at,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "messages": {
        const data = payload as EntityLocalPayloadMap["messages"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const sender_id = data.sender_id ?? data.sender;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(
          entity,
          data.id as string,
          sender_id,
          "sender_id"
        );
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          conversation_id,
          sender_id,
          message_type: data.message_type ?? data.messageType,
          content: data.content as string,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "calls": {
        const data = payload as EntityLocalPayloadMap["calls"];
        const conversation_id = data.conversation_id ?? data.conversation;
        const initiator_id = data.initiator_id ?? data.initiator;
        this.validateForeignKey(
          entity,
          data.id as string,
          conversation_id,
          "conversation_id"
        );
        this.validateForeignKey(
          entity,
          data.id as string,
          initiator_id,
          "initiator_id"
        );
        const start_time = toInt(data.start_time ?? data.startTime);
        const end_time = toInt(data.end_time ?? data.endTime);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        this.validateTimestamp(
          entity,
          data.id as string,
          start_time,
          "start_time"
        );
        return {
          id: data.id as string,
          call_type: data.call_type ?? data.callType,
          status: data.status,
          start_time,
          end_time,
          conversation_id,
          initiator_id,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "call_participants": {
        const data = payload as EntityLocalPayloadMap["call_participants"];
        const call_id = data.call_id ?? data.call;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          call_id,
          "call_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const joined_at = toInt(data.joined_at ?? data.joinedAt);
        const left_at = toInt(data.left_at ?? data.leftAt);
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          call_id,
          user_id,
          joined_at,
          left_at,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
        };
      }
      case "message_receipts": {
        const data = payload as EntityLocalPayloadMap["message_receipts"];
        const message_id = data.message_id ?? data.message;
        const user_id = data.user_id ?? data.user;
        this.validateForeignKey(
          entity,
          data.id as string,
          message_id,
          "message_id"
        );
        this.validateForeignKey(entity, data.id as string, user_id, "user_id");
        const created_at = toInt(data.created_at ?? data.createdAt);
        const updated_at = toInt(data.updated_at ?? data.updatedAt);
        return {
          id: data.id as string,
          status: data.status,
          message_id,
          user_id,
          is_deleted: Boolean(data.is_deleted ?? data.isDeleted),
          created_at,
          updated_at,
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

  private async checkEntitiesExist(
    entity: SyncEntity,
    ids: string[]
  ): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    try {
      const records = await this.db
        .get(entity)
        .query(Q.where("id", Q.oneOf(ids)))
        .fetch();
      return new Set(records.map((r) => r.id as string));
    } catch (error) {
      const appErr = toAppError(error, "sync");
      syncLog.warn("sync › existence check failed", { entity, ...appErr });
      return new Set();
    }
  }

  private async normalizePullChanges(changes: SyncChanges) {
    const toIds = (arr: { id?: string }[]): string[] =>
      arr.flatMap((c) => (c.id ? [c.id] : []));

    const localEncryptedUpdatesToSkip = await this.migrationGuard.computeSkips(changes);

    const existingIds = {
      conversations: await this.checkEntitiesExist(
        "conversations",
        toIds(changes.conversations.created)
      ),
      conversation_participants: await this.checkEntitiesExist(
        "conversation_participants",
        toIds(changes.conversation_participants.created)
      ),
      messages: await this.checkEntitiesExist(
        "messages",
        toIds(changes.messages.created)
      ),
      calls: await this.checkEntitiesExist(
        "calls",
        toIds(changes.calls.created)
      ),
      call_participants: await this.checkEntitiesExist(
        "call_participants",
        toIds(changes.call_participants.created)
      ),
      message_receipts: await this.checkEntitiesExist(
        "message_receipts",
        toIds(changes.message_receipts.created)
      ),
    };

    return {
      conversations: {
        created: changes.conversations.created
          .filter((item) => !existingIds.conversations.has(item.id ?? ""))
          .map((item) => ({
            ...item,
            conversation_type: item.conversation_type,
            type: item.conversation_type,
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })),
        updated: changes.conversations.updated.map((item) => ({
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
        created: changes.conversation_participants.created
          .filter(
            (item) => !existingIds.conversation_participants.has(item.id ?? "")
          )
          .map((item) => ({
            ...item,
            conversation: item.conversation_id,
            user: item.user_id,
            joined_at: this.toTimestamp(item.joined_at),
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })),
        updated: changes.conversation_participants.updated.map((item) => ({
          ...item,
          conversation: item.conversation_id,
          user: item.user_id,
          joined_at: this.toTimestamp(item.joined_at),
          is_deleted: item.is_deleted ?? false,
          created_at: this.toTimestamp(item.created_at),
          updated_at: this.toTimestamp(item.updated_at),
        })),
        deleted: changes.conversation_participants.deleted,
      },
      messages: {
        created: changes.messages.created
          .filter((item) => !existingIds.messages.has(item.id ?? ""))
          .map((item) => {
            // During a guest→auth migration the server may have messages encrypted
            // with the old guest conversation key (ecdh:K_AB). Decrypt them to
            // plaintext here so reEncryptAfterMigration() can re-encrypt with the
            // auth key before the push phase.
            let content = (item.content ?? "") as string;
            if (content.startsWith("ecdh:") && this.messageRepository?.hasMigrationKeys()) {
              const convId = item.conversation_id ?? "";
              const decrypted = this.messageRepository.tryDecryptWithMigrationKeys(content, convId);
              if (decrypted !== null) {
                content = decrypted;
              }
            }
            return {
              ...item,
              content,
              conversation: item.conversation_id,
              sender: item.sender_id,
              message_type: item.message_type,
              is_deleted: item.is_deleted ?? false,
              created_at: this.toTimestamp(item.created_at),
              updated_at: this.toTimestamp(item.updated_at),
            };
          }),
        updated: changes.messages.updated
          .filter((item) => !localEncryptedUpdatesToSkip.has(item.id ?? ""))
          .map((item) => ({
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
        created: changes.calls.created
          .filter((item) => !existingIds.calls.has(item.id ?? ""))
          .map((item) => ({
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
        updated: changes.calls.updated.map((item) => ({
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
        created: changes.call_participants.created
          .filter((item) => !existingIds.call_participants.has(item.id ?? ""))
          .map((item) => ({
            ...item,
            call: item.call_id,
            user: item.user_id,
            joined_at: this.toTimestamp(item.joined_at),
            left_at:
              item.left_at !== null ? this.toTimestamp(item.left_at) : null,
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })),
        updated: changes.call_participants.updated.map((item) => ({
          ...item,
          call: item.call_id,
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
        created: changes.message_receipts.created
          .filter((item) => !existingIds.message_receipts.has(item.id ?? ""))
          .map((item) => ({
            ...item,
            message: item.message_id,
            user: item.user_id,
            is_deleted: item.is_deleted ?? false,
            created_at: this.toTimestamp(item.created_at),
            updated_at: this.toTimestamp(item.updated_at),
          })),
        updated: changes.message_receipts.updated.map((item) => ({
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
