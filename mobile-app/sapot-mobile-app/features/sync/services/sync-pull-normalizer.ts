import { Database, Q } from "@nozbe/watermelondb";
import { toAppError } from "@/features/shared/errors";
import { syncLog } from "@/features/shared/utils/logger";
import type { PushLocalDataRequestBody } from "../api/sync.api";
import { MigrationGuard } from "./migration-guard";
import type { MessageRepository } from "@/features/chat/repositories/message-repository";

type SyncChanges = PushLocalDataRequestBody["changes"];
type SyncEntity =
  | "conversations"
  | "conversation_participants"
  | "messages"
  | "calls"
  | "call_participants"
  | "message_receipts";

export class SyncPullNormalizer {
  constructor(
    private readonly db: Database,
    private readonly migrationGuard: MigrationGuard,
    private messageRepository?: MessageRepository,
  ) {}

  setMessageRepository(repo: MessageRepository): void {
    this.messageRepository = repo;
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

  async normalizePullChanges(changes: SyncChanges): Promise<SyncChanges> {
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
