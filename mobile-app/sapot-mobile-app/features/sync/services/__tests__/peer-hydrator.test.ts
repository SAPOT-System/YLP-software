import { Database } from "@nozbe/watermelondb";
import { PeerHydrator } from "../peer-hydrator";
import type { PeerService } from "@/features/shared/peer/peer-service";
import type { PeerRepository } from "@/features/shared/peer/peer-repository";
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

describe("PeerHydrator", () => {
  let hydrator: PeerHydrator;
  let mockDatabase: Database;
  let mockPeerService: jest.Mocked<PeerService>;
  let mockPeerRepository: jest.Mocked<PeerRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDatabase = mockDb() as unknown as Database;
    mockPeerService = {
      getOrCreatePeerById: jest.fn(),
    } as unknown as jest.Mocked<PeerService>;
    mockPeerRepository = {
      savePeer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PeerRepository>;
  });

  describe("hydrate", () => {
    it("should skip hydration when peerService is undefined", async () => {
      // Arrange
      hydrator = new PeerHydrator(mockDatabase, undefined, mockPeerRepository);
      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockDatabase.get).not.toHaveBeenCalled();
      expect(mockPeerService.getOrCreatePeerById).not.toHaveBeenCalled();
    });

    it("should return immediately when all IDs already exist in DB", async () => {
      // Arrange
      const existingRecord = { id: "peer-1" };
      const dbWithPeer = mockDb([existingRecord]) as unknown as Database;
      hydrator = new PeerHydrator(dbWithPeer, mockPeerService, mockPeerRepository);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockPeerService.getOrCreatePeerById).not.toHaveBeenCalled();
    });

    it("should call getOrCreatePeerById only for missing IDs", async () => {
      // Arrange
      const existingRecord = { id: "peer-1" };
      const dbWithPeer = mockDb([existingRecord]) as unknown as Database;
      hydrator = new PeerHydrator(dbWithPeer, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockResolvedValue({} as never);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
        { sender_id: "peer-2", content: "test", conversation_id: "conv-1" } as never,
        { sender_id: "peer-3", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledTimes(2);
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith(
        "peer-2",
        { isWebSocketAllowed: expect.any(Function) }
      );
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith(
        "peer-3",
        { isWebSocketAllowed: expect.any(Function) }
      );
    });

    it("should collect IDs from multiple entity types", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockResolvedValue({} as never);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "sender-1", content: "test", conversation_id: "conv-1" } as never,
      ];
      changes.calls.created = [
        { initiator_id: "initiator-1", call_type: "audio", status: "active", start_time: 0, end_time: 0, conversation_id: "conv-1" } as never,
      ];
      changes.conversation_participants.created = [
        { user_id: "user-1", conversation_id: "conv-1", joined_at: 0 } as never,
      ];
      changes.call_participants.created = [
        { user_id: "user-2", call_id: "call-1", joined_at: 0 } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      // Should dedup and call once per unique ID
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledTimes(4);
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("sender-1", expect.any(Object));
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("initiator-1", expect.any(Object));
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("user-1", expect.any(Object));
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("user-2", expect.any(Object));
    });

    it("should deduplicate IDs from multiple sources", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockResolvedValue({} as never);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
        { sender_id: "peer-1", content: "test2", conversation_id: "conv-1" } as never,
      ];
      changes.calls.created = [
        { initiator_id: "peer-1", call_type: "audio", status: "active", start_time: 0, end_time: 0, conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledTimes(1);
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("peer-1", expect.any(Object));
    });

    it("should create fallback peer when getOrCreatePeerById fails and peerRepository is present", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      const error = new Error("Network error");
      mockPeerService.getOrCreatePeerById.mockRejectedValue(error);
      (mockPeerRepository.savePeer as jest.Mock).mockResolvedValue(undefined);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockPeerRepository.savePeer).toHaveBeenCalledWith({
        id: "peer-1",
        username: "peer-1",
        firstName: "Unknown",
        lastName: "User",
      });
    });

    it("should not crash when both getOrCreatePeerById and fallback creation fail", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockRejectedValue(new Error("Network error"));
      mockPeerRepository.savePeer.mockRejectedValue(new Error("DB error"));

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act & Assert (should not throw)
      await expect(hydrator.hydrate(changes)).resolves.toBeUndefined();
      expect(mockPeerRepository.savePeer).toHaveBeenCalled();
    });

    it("should not crash when peerRepository is undefined and getOrCreatePeerById fails", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, undefined);

      mockPeerService.getOrCreatePeerById.mockRejectedValue(new Error("Network error"));

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act & Assert (should not throw)
      await expect(hydrator.hydrate(changes)).resolves.toBeUndefined();
    });

    it("should return immediately for empty changes", async () => {
      // Arrange
      hydrator = new PeerHydrator(mockDatabase, mockPeerService, mockPeerRepository);
      const changes = createEmptyChanges();

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockDatabase.get).not.toHaveBeenCalled();
      expect(mockPeerService.getOrCreatePeerById).not.toHaveBeenCalled();
    });

    it("should handle empty strings in ID arrays", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockResolvedValue({} as never);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "", content: "test", conversation_id: "conv-1" } as never,
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      // Only peer-1 should be fetched (empty string filtered out)
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledTimes(1);
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("peer-1", expect.any(Object));
    });

    it("should handle undefined IDs in arrays", async () => {
      // Arrange
      const dbEmpty = mockDb([]) as unknown as Database;
      hydrator = new PeerHydrator(dbEmpty, mockPeerService, mockPeerRepository);

      mockPeerService.getOrCreatePeerById.mockResolvedValue({} as never);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { content: "test", conversation_id: "conv-1" } as never,
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act
      await hydrator.hydrate(changes);

      // Assert
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledTimes(1);
      expect(mockPeerService.getOrCreatePeerById).toHaveBeenCalledWith("peer-1", expect.any(Object));
    });

    it("should handle database query failure gracefully", async () => {
      // Arrange
      const dbError = {
        get: jest.fn().mockReturnValue({
          query: jest.fn().mockReturnValue({
            fetch: jest.fn().mockRejectedValue(new Error("DB query failed")),
          }),
        }),
      } as unknown as Database;
      hydrator = new PeerHydrator(dbError, mockPeerService, mockPeerRepository);

      const changes = createEmptyChanges();
      changes.messages.created = [
        { sender_id: "peer-1", content: "test", conversation_id: "conv-1" } as never,
      ];

      // Act & Assert (should not throw)
      await expect(hydrator.hydrate(changes)).resolves.toBeUndefined();
      expect(mockPeerService.getOrCreatePeerById).not.toHaveBeenCalled();
    });

  });
});
