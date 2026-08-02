import { Database } from "@nozbe/watermelondb";
import { synchronize } from "@nozbe/watermelondb/sync";
import SyncLogger from "@nozbe/watermelondb/sync/SyncLogger";
import { isAxiosError } from "axios";
import { toAppError } from "@/features/shared/core/errors";
import { CallStatus } from "@/features/shared/core/database/model/Call";
import { MessageStatusType } from "@/features/shared/core/database/model/MessageStatus";
import {
  getSyncLastPulledAt,
  saveSyncLastPulledAt,
} from "@/features/shared/core/stores/secure-config";
import { TypedEventEmitter } from "@/features/shared/core/utils/typed-event-emitter";
import { syncLog } from "@/features/shared/core/utils/logger";
import { clearMigrationState } from "@/features/shared/core/stores/secure-config";
import {
  pushLocalDataApi,
  sync as syncApi,
  type PushLocalDataRequestBody,
  type ServerSyncResponse,
} from "../api/sync.api";
import { PeerHydrator } from "./peer-hydrator";
import { SyncPushFilter } from "./push-filter";
import { MigrationGuard } from "./migration-guard";
import { SyncPayloadBuilder } from "./sync-payload-builder";
import { SyncPullNormalizer } from "./sync-pull-normalizer";
import type { MessageReceiptManager } from "@/features/chat/services/message-receipt-manager";
import { ConversationParticipantRepository } from "@/features/chat/repositories/conversation-participant-repository";
import type { PeerService } from "@/features/shared/peer/peer-service";
import type { PeerRepository } from "@/features/shared/peer/peer-repository";
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
  messageReceiptManager: MessageReceiptManager;
  messageRepository: MessageRepository;
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
  private readonly messageRepository: MessageRepository;
  private peerHydrator: PeerHydrator;
  private pushFilter: SyncPushFilter;
  private migrationGuard: MigrationGuard;
  private pullNormalizer: SyncPullNormalizer;
  private readonly payloadBuilder = new SyncPayloadBuilder();

  constructor({ db, messageReceiptManager, messageRepository, currentUserId, peerService, peerRepository }: SyncServiceParams) {
    super();
    this.db = db;
    this.currentUserId = currentUserId;
    this.peerRepository = peerRepository;
    this.messageRepository = messageRepository;
    this.conversationParticipantRepository =
      new ConversationParticipantRepository(this.db);
    this.syncLogger = new SyncLogger(20);
    this.peerHydrator = new PeerHydrator(db, peerService, peerRepository);
    this.pushFilter = new SyncPushFilter(messageReceiptManager);
    this.migrationGuard = new MigrationGuard(db);
    this.pullNormalizer = new SyncPullNormalizer(db, this.migrationGuard, messageRepository);
    syncLog.info("sync › service constructed", {
      hasDb: Boolean(db),
      hasReceiptManager: Boolean(messageReceiptManager),
      hasMessageRepository: Boolean(messageRepository),
    });
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
          const normalizedChanges = await this.pullNormalizer.normalizePullChanges(changes);

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
          return this.pushToServer(changes as SyncChanges, lastPulledAt);
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
    const { changes: payload, guest_users, experimentalRejectedIds } =
      await this.buildPushPayload(changes);
    syncLog.debug("sync › push payload", {
      hasChanges: this.hasPayload(payload),
      rejectedIds: experimentalRejectedIds,
    });
    if (this.hasPayload(payload)) {
      await pushLocalDataApi({
        last_pulled_at: lastPulledAt ?? 0,
        changes: payload,
        guest_users,
      });
    }
    return { experimentalRejectedIds };
  }

  private async buildPushPayload(
    changes: SyncChanges
  ): Promise<{
    changes: PushLocalDataRequestBody["changes"];
    guest_users: Record<
      string,
      { first_name: string; last_name: string; username: string }
    >;
    experimentalRejectedIds: Record<string, string[]>;
  }> {
    type C = PushLocalDataRequestBody["changes"];

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

    const isExcludedCallParticipant = (
      record: EntityLocalPayloadMap["call_participants"]
    ): boolean => {
      const callId = record.call_id ?? record.call;
      return Boolean(callId && excludedCallIds.has(callId));
    };

    const mapSelfReceiptStatus = (
      record: EntityLocalPayloadMap["message_receipts"]
    ): EntityLocalPayloadMap["message_receipts"] => {
      const msgId = record.message_id ?? record.message;
      // A message to self is delivered locally as soon as it is stored.
      if (
        msgId &&
        selfMessageIds.has(msgId) &&
        record.status === MessageStatusType.SENT
      ) {
        return { ...record, status: MessageStatusType.DELIVERED };
      }
      return record;
    };

    const createdReceipts = changes.message_receipts.created.map((record) =>
      mapSelfReceiptStatus(
        record as EntityLocalPayloadMap["message_receipts"]
      )
    );
    const updatedReceipts = changes.message_receipts.updated.map((record) =>
      mapSelfReceiptStatus(
        record as EntityLocalPayloadMap["message_receipts"]
      )
    );

    const rejectedIds = (
      records: { id?: string }[],
      shouldReject: (record: { id?: string }) => boolean
    ): string[] =>
      records.flatMap((record) =>
        record.id && shouldReject(record) ? [record.id] : []
      );

    const rejectedReceiptIds = rejectedIds(
      [...createdReceipts, ...updatedReceipts],
      (record) =>
        !this.pushFilter.shouldPushReceipt(
          (record as EntityLocalPayloadMap["message_receipts"])
            .status as MessageStatusType
        )
    );
    const rejectedCallIds = rejectedIds(
      [...changes.calls.created, ...changes.calls.updated],
      (record) => excludedCallIds.has(record.id as string)
    );
    const rejectedCallParticipantIds = rejectedIds(
      [
        ...changes.call_participants.created,
        ...changes.call_participants.updated,
      ],
      (record) =>
        isExcludedCallParticipant(
          record as EntityLocalPayloadMap["call_participants"]
        )
    );

    const experimentalRejectedIds: Record<string, string[]> = {};
    if (rejectedReceiptIds.length > 0) {
      experimentalRejectedIds.message_receipts = rejectedReceiptIds;
    }
    if (rejectedCallIds.length > 0) {
      experimentalRejectedIds.calls = rejectedCallIds;
    }
    if (rejectedCallParticipantIds.length > 0) {
      experimentalRejectedIds.call_participants =
        rejectedCallParticipantIds;
    }

    const conversationParticipantsCreated = changes.conversation_participants.created.map(
      (r) => this.payloadBuilder.toServerPayload("conversation_participants", r)
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
          this.payloadBuilder.toServerPayload("conversations", r)
        ) as C["conversations"]["created"],
        updated: changes.conversations.updated.map((r) =>
          this.payloadBuilder.toServerPayload("conversations", r)
        ) as C["conversations"]["updated"],
        deleted: changes.conversations.deleted,
      },
      conversation_participants: {
        created: conversationParticipantsCreated,
        updated: changes.conversation_participants.updated.map((r) =>
          this.payloadBuilder.toServerPayload("conversation_participants", r)
        ) as C["conversation_participants"]["updated"],
        deleted: changes.conversation_participants.deleted,
      },
      messages: {
        created: changes.messages.created
          .map((r) =>
            this.payloadBuilder.toServerPayload("messages", r)
          ) as C["messages"]["created"],
        updated: changes.messages.updated
          .map((r) =>
            this.payloadBuilder.toServerPayload("messages", r)
          ) as C["messages"]["updated"],
        deleted: changes.messages.deleted,
      },
      calls: {
        created: changes.calls.created
          .filter((r) => !excludedCallIds.has(r.id as string))
          .map((r) =>
            this.payloadBuilder.toServerPayload("calls", r)
          ) as C["calls"]["created"],
        updated: changes.calls.updated
          .filter((r) => !excludedCallIds.has(r.id as string))
          .map((r) =>
            this.payloadBuilder.toServerPayload("calls", r)
          ) as C["calls"]["updated"],
        deleted: changes.calls.deleted,
      },
      call_participants: {
        created: changes.call_participants.created
          .filter(
            (r) =>
              !isExcludedCallParticipant(
                r as EntityLocalPayloadMap["call_participants"]
              )
          )
          .map((r) =>
            this.payloadBuilder.toServerPayload("call_participants", r)
          ) as C["call_participants"]["created"],
        updated: changes.call_participants.updated
          .filter(
            (r) =>
              !isExcludedCallParticipant(
                r as EntityLocalPayloadMap["call_participants"]
              )
          )
          .map((r) =>
            this.payloadBuilder.toServerPayload("call_participants", r)
          ) as C["call_participants"]["updated"],
        deleted: changes.call_participants.deleted,
      },
      message_receipts: {
        created: createdReceipts
          .filter((r) => this.pushFilter.shouldPushReceipt(r.status as MessageStatusType))
          .map((r) =>
            this.payloadBuilder.toServerPayload("message_receipts", r)
          ) as C["message_receipts"]["created"],
        updated: updatedReceipts
          .filter((r) => this.pushFilter.shouldPushReceipt(r.status as MessageStatusType))
          .map((r) =>
            this.payloadBuilder.toServerPayload("message_receipts", r)
          ) as C["message_receipts"]["updated"],
        deleted: changes.message_receipts.deleted,
      },
    }, guest_users, experimentalRejectedIds };
  }

  private hasPayload(payload: PushLocalDataRequestBody["changes"]) {
    return Object.values(payload).some(
      (items) =>
        items.created.length > 0 ||
        items.updated.length > 0 ||
        items.deleted.length > 0
    );
  }

}
