import { Database } from "@nozbe/watermelondb";
import { MigrationGuard } from "../migration-guard";
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

describe("MigrationGuard", () => {
  let guard: MigrationGuard;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("computeSkips", () => {
    it("should return empty Set when scheduleSkip was not called", async () => {
      // Arrange
      const mockDatabase = mockDb() as unknown as Database;
      guard = new MigrationGuard(mockDatabase);
      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:encrypted-data" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set());
      expect(mockDatabase.get).not.toHaveBeenCalled();
    });

    it("should return empty Set when there are no server ecdh: updates", async () => {
      // Arrange
      const mockDatabase = mockDb() as unknown as Database;
      guard = new MigrationGuard(mockDatabase);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "plain text message" } as never,
        { id: "msg-2", content: "another plain message" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set());
      expect(mockDatabase.get).not.toHaveBeenCalled();
    });

    it("should return empty Set when server has ecdh: but local does not", async () => {
      // Arrange
      const mockLocalMessage = {
        id: "msg-1",
        content: "plain text message",
      };
      const dbWithMessage = mockDb([mockLocalMessage]) as unknown as Database;
      guard = new MigrationGuard(dbWithMessage);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:encrypted-data" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set());
    });

    it("should return message IDs when both server and local are ecdh:", async () => {
      // Arrange
      const mockLocalMessages = [
        { id: "msg-1", content: "ecdh:local-encrypted-data" },
        { id: "msg-2", content: "ecdh:another-encrypted" },
      ];
      const dbWithMessages = mockDb(mockLocalMessages) as unknown as Database;
      guard = new MigrationGuard(dbWithMessages);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:server-encrypted-data" } as never,
        { id: "msg-2", content: "ecdh:different-encrypted" } as never,
        { id: "msg-3", content: "ecdh:not-local" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set(["msg-1", "msg-2"]));
    });

    it("should reset flag after computeSkips is called", async () => {
      // Arrange
      const mockDatabase = mockDb() as unknown as Database;
      guard = new MigrationGuard(mockDatabase);
      guard.scheduleSkip();

      const changes = createEmptyChanges();

      // Act
      await guard.computeSkips(changes);
      const secondResult = await guard.computeSkips(changes);

      // Assert
      expect(secondResult).toEqual(new Set());
    });

    it("should handle empty string content safely", async () => {
      // Arrange
      const mockLocalMessages = [
        { id: "msg-1", content: "" },
        { id: "msg-2", content: "ecdh:encrypted" },
      ];
      const dbWithMessages = mockDb(mockLocalMessages) as unknown as Database;
      guard = new MigrationGuard(dbWithMessages);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:server-data" } as never,
        { id: "msg-2", content: "ecdh:server-data2" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set(["msg-2"]));
    });


    it("should handle missing ID in server update safely", async () => {
      // Arrange
      const mockLocalMessages = [
        { id: "msg-1", content: "ecdh:encrypted" },
      ];
      const dbWithMessages = mockDb(mockLocalMessages) as unknown as Database;
      guard = new MigrationGuard(dbWithMessages);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { content: "ecdh:server-data" } as never,
        { id: "msg-1", content: "ecdh:server-data2" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      expect(result).toEqual(new Set(["msg-1"]));
    });

    it("should filter out undefined IDs from database query", async () => {
      // Arrange
      const mockLocalMessages = [
        { id: "msg-1", content: "ecdh:encrypted" },
      ];
      const dbWithMessages = mockDb(mockLocalMessages) as unknown as Database;
      guard = new MigrationGuard(dbWithMessages);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { content: "ecdh:server-data" } as never,
        { id: "msg-1", content: "ecdh:server-data2" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      // Should only query for msg-1 (the undefined ID is filtered out)
      expect(dbWithMessages.get).toHaveBeenCalled();
      expect(result).toEqual(new Set(["msg-1"]));
    });

    it("should handle multiple ecdh: messages with mixed local state", async () => {
      // Arrange
      const mockLocalMessages = [
        { id: "msg-1", content: "ecdh:local1" },
        { id: "msg-2", content: "plain local" },
        { id: "msg-3", content: "ecdh:local3" },
      ];
      const dbWithMessages = mockDb(mockLocalMessages) as unknown as Database;
      guard = new MigrationGuard(dbWithMessages);
      guard.scheduleSkip();

      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:server1" } as never,
        { id: "msg-2", content: "ecdh:server2" } as never,
        { id: "msg-3", content: "ecdh:server3" } as never,
      ];

      // Act
      const result = await guard.computeSkips(changes);

      // Assert
      // Only msg-1 and msg-3 are both local and server ecdh:
      expect(result).toEqual(new Set(["msg-1", "msg-3"]));
    });

  });

  describe("scheduleSkip", () => {
    it("should set internal flag for next computeSkips call", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      guard = new MigrationGuard(dbEmpty);
      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:data" } as never,
      ];

      // Act
      guard.scheduleSkip();
      await guard.computeSkips(changes);

      // Assert
      // Should process the skip logic
      expect(dbEmpty.get).toHaveBeenCalled();
    });

    it("should allow multiple calls but only affect next computeSkips", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      guard = new MigrationGuard(dbEmpty);
      const changes = createEmptyChanges();
      changes.messages.updated = [
        { id: "msg-1", content: "ecdh:data" } as never,
      ];

      // Act
      guard.scheduleSkip();
      guard.scheduleSkip();
      const result = await guard.computeSkips(changes);

      // Assert
      // Flag should be consumed
      expect(result).toEqual(new Set());

      // Reset database call count
      jest.clearAllMocks();
      const newDb = mockDb([]) as unknown as Database;
      guard = new MigrationGuard(newDb);

      // Call again without scheduleSkip
      const secondResult = await guard.computeSkips(changes);

      // Assert
      expect(secondResult).toEqual(new Set());
      expect(newDb.get).not.toHaveBeenCalled();
    });
  });
});
