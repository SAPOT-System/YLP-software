import { Database } from "@nozbe/watermelondb";
import { SyncPullNormalizer } from "../sync-pull-normalizer";
import { MigrationGuard } from "../migration-guard";
import type { MessageRepository } from "@/features/chat/repositories/message-repository";
import type { PushLocalDataRequestBody } from "../../api/sync.api";

type SyncChanges = PushLocalDataRequestBody["changes"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = (records: any[] = []) => ({
  get: jest.fn().mockReturnValue({
    query: jest.fn().mockReturnValue({
      fetch: jest.fn().mockResolvedValue(records),
    }),
  }),
});

const createEmptyChanges = (): SyncChanges => ({
  conversations: { created: [], updated: [], deleted: [] },
  conversation_participants: { created: [], updated: [], deleted: [] },
  messages: { created: [], updated: [], deleted: [] },
  calls: { created: [], updated: [], deleted: [] },
  call_participants: { created: [], updated: [], deleted: [] },
  message_receipts: { created: [], updated: [], deleted: [] },
});

describe("SyncPullNormalizer", () => {
  let mockDatabase: Database;
  let migrationGuard: MigrationGuard;
  let normalizer: SyncPullNormalizer;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no existing records in db (nothing to de-dup against)
    mockDatabase = mockDb() as unknown as Database;
    migrationGuard = new MigrationGuard(mockDatabase);
    normalizer = new SyncPullNormalizer(mockDatabase, migrationGuard);
  });

  describe("server→local field renaming", () => {
    it("should rename conversation_id to conversation and user_id to user for conversation_participants", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.conversation_participants.created = [
        {
          id: "cp-1",
          conversation_id: "conv-abc",
          user_id: "user-xyz",
          joined_at: "2026-01-01T00:00:00.000Z",
          is_deleted: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      const cp = result.conversation_participants.created[0];
      expect(cp).toBeDefined();
      expect((cp as Record<string, unknown>).conversation).toBe("conv-abc");
      expect((cp as Record<string, unknown>).user).toBe("user-xyz");
    });

    it("should rename conversation_id to conversation and sender_id to sender for messages", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.messages.created = [
        {
          id: "msg-1",
          conversation_id: "conv-abc",
          sender_id: "user-xyz",
          content: "hello",
          message_type: "text",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      const msg = result.messages.created[0];
      expect(msg).toBeDefined();
      expect((msg as Record<string, unknown>).conversation).toBe("conv-abc");
      expect((msg as Record<string, unknown>).sender).toBe("user-xyz");
    });

    it("should rename call_id to call and user_id to user for call_participants", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.call_participants.created = [
        {
          id: "cp-call-1",
          call_id: "call-abc",
          user_id: "user-xyz",
          joined_at: 1735689600000,
          left_at: null,
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      const cp = result.call_participants.created[0];
      expect(cp).toBeDefined();
      expect((cp as Record<string, unknown>).call).toBe("call-abc");
      expect((cp as Record<string, unknown>).user).toBe("user-xyz");
    });

    it("should rename message_id to message and user_id to user for message_receipts", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.message_receipts.created = [
        {
          id: "mr-1",
          message_id: "msg-abc",
          user_id: "user-xyz",
          status: "delivered",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      const mr = result.message_receipts.created[0];
      expect(mr).toBeDefined();
      expect((mr as Record<string, unknown>).message).toBe("msg-abc");
      expect((mr as Record<string, unknown>).user).toBe("user-xyz");
    });

    it("should convert string timestamps to numbers for conversations", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.conversations.created = [
        {
          id: "conv-1",
          conversation_type: "direct",
          is_deleted: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      const conv = result.conversations.created[0];
      expect(conv).toBeDefined();
      expect(typeof (conv as Record<string, unknown>).created_at).toBe("number");
      expect(typeof (conv as Record<string, unknown>).updated_at).toBe("number");
    });
  });

  describe("de-dup against existing ids", () => {
    it("should filter out created records whose ids already exist in db", async () => {
      // Arrange — db returns existing record for conv-existing
      const dbWithExisting = mockDb([{ id: "conv-existing" }]) as unknown as Database;
      const guard = new MigrationGuard(dbWithExisting);
      const normalizerWithExisting = new SyncPullNormalizer(dbWithExisting, guard);

      const changes = createEmptyChanges();
      changes.conversations.created = [
        {
          id: "conv-existing",
          conversation_type: "direct",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
        {
          id: "conv-new",
          conversation_type: "direct",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizerWithExisting.normalizePullChanges(changes);

      // Assert
      expect(result.conversations.created).toHaveLength(1);
      expect((result.conversations.created[0] as Record<string, unknown>).id).toBe("conv-new");
    });

    it("should not filter updated records (de-dup only applies to created)", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.conversations.updated = [
        {
          id: "conv-1",
          conversation_type: "direct",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      expect(result.conversations.updated).toHaveLength(1);
    });

    it("should pass through deleted arrays unchanged", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.conversations.deleted = ["conv-deleted-1", "conv-deleted-2"];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert
      expect(result.conversations.deleted).toEqual(["conv-deleted-1", "conv-deleted-2"]);
    });
  });

  describe("MigrationGuard computeSkips / scheduleSkip integration", () => {
    it("should drop updated messages that are in the skips set", async () => {
      // Arrange — local db has msg-1 as ecdh: encrypted
      const dbWithMsg = mockDb([
        { id: "msg-1", content: "ecdh:local-encrypted" },
      ]) as unknown as Database;
      const guard = new MigrationGuard(dbWithMsg);
      guard.scheduleSkip();
      const normalizerWithSkip = new SyncPullNormalizer(dbWithMsg, guard);

      const changes = createEmptyChanges();
      changes.messages.updated = [
        {
          id: "msg-1",
          content: "ecdh:server-encrypted",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
        {
          id: "msg-2",
          content: "plain message",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizerWithSkip.normalizePullChanges(changes);

      // Assert — msg-1 should be dropped; msg-2 passes through
      expect(result.messages.updated).toHaveLength(1);
      expect((result.messages.updated[0] as Record<string, unknown>).id).toBe("msg-2");
    });

    it("should not skip updated messages when scheduleSkip was not called", async () => {
      // Arrange
      const changes = createEmptyChanges();
      changes.messages.updated = [
        {
          id: "msg-1",
          content: "ecdh:server-encrypted",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizer.normalizePullChanges(changes);

      // Assert — no skip applied
      expect(result.messages.updated).toHaveLength(1);
    });

    it("should consume the skip flag (second call keeps all updates)", async () => {
      // Arrange — guard flag consumed after first normalizePullChanges
      const dbWithMsg = mockDb([
        { id: "msg-1", content: "ecdh:local-encrypted" },
      ]) as unknown as Database;
      const guard = new MigrationGuard(dbWithMsg);
      guard.scheduleSkip();
      const normalizerWithSkip = new SyncPullNormalizer(dbWithMsg, guard);

      const changes = createEmptyChanges();
      changes.messages.updated = [
        {
          id: "msg-1",
          content: "ecdh:server-encrypted",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act — first call consumes the skip
      await normalizerWithSkip.normalizePullChanges(changes);
      // Second call — flag cleared, msg-1 should no longer be skipped
      const secondResult = await normalizerWithSkip.normalizePullChanges(changes);

      // Assert
      expect(secondResult.messages.updated).toHaveLength(1);
    });
  });

  describe("messageRepository (constructor-injected)", () => {
    it("should use message repository to decrypt ecdh: messages in created", async () => {
      // Arrange
      const mockRepo = {
        hasMigrationKeys: jest.fn().mockReturnValue(true),
        tryDecryptWithMigrationKeys: jest.fn().mockReturnValue("decrypted content"),
      } as unknown as jest.Mocked<MessageRepository>;
      const normalizerWithRepo = new SyncPullNormalizer(mockDatabase, migrationGuard, mockRepo);

      const changes = createEmptyChanges();
      changes.messages.created = [
        {
          id: "msg-1",
          content: "ecdh:encrypted",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizerWithRepo.normalizePullChanges(changes);

      // Assert
      const msg = result.messages.created[0];
      expect((msg as Record<string, unknown>).content).toBe("decrypted content");
      expect(mockRepo.tryDecryptWithMigrationKeys).toHaveBeenCalledWith("ecdh:encrypted", "conv-1");
    });

    it("should not attempt decrypt when hasMigrationKeys returns false", async () => {
      // Arrange
      const mockRepo = {
        hasMigrationKeys: jest.fn().mockReturnValue(false),
        tryDecryptWithMigrationKeys: jest.fn(),
      } as unknown as jest.Mocked<MessageRepository>;
      const normalizerWithRepo = new SyncPullNormalizer(mockDatabase, migrationGuard, mockRepo);

      const changes = createEmptyChanges();
      changes.messages.created = [
        {
          id: "msg-1",
          content: "ecdh:encrypted",
          conversation_id: "conv-1",
          sender_id: "user-1",
          is_deleted: false,
          created_at: 1735689600000,
          updated_at: 1735689600000,
        } as never,
      ];

      // Act
      const result = await normalizerWithRepo.normalizePullChanges(changes);

      // Assert — content untouched, decrypt not called
      expect((result.messages.created[0] as Record<string, unknown>).content).toBe("ecdh:encrypted");
      expect(mockRepo.tryDecryptWithMigrationKeys).not.toHaveBeenCalled();
    });
  });
});
