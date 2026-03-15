import { createTestPeer, createTestPeers } from "@/test/factories/user.factory";
import {
  createCollectionMock,
  createDestroyableRecord,
  createUpdatableRecord,
  createWatermelonDbMock,
} from "@/test/mocks/database.mock-builders";
import type { Database } from "@nozbe/watermelondb";
import { PeerRepository } from "../peer-repository";

describe("PeerRepository", () => {
  let repository: PeerRepository;
  let mockCollection: ReturnType<typeof createCollectionMock>;
  let mockDb: ReturnType<typeof createWatermelonDbMock>;

  beforeEach(() => {
    mockCollection = createCollectionMock();
    mockDb = createWatermelonDbMock(mockCollection);

    repository = new PeerRepository(mockDb as unknown as Database);
  });

  describe("savePeer", () => {
    it("saves a new peer", async () => {
      const mockPeer = createTestPeer({
        id: "peer-1",
        username: "Alice",
        isOnline: false,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb.write.mockImplementation((fn: any) =>
        Promise.resolve(fn()).then(() => mockPeer)
      );

      await repository.savePeer({
        id: "peer-1",
        username: "Alice",
        firstName: "Rish",
      });

      expect(mockDb.write).toHaveBeenCalled();
    });

    it("throws when write fails", async () => {
      mockDb.write.mockRejectedValue(new Error("write failed"));

      await expect(
        repository.savePeer({
          id: "peer-1",
          username: "Alice",
          firstName: "Rish",
        })
      ).rejects.toThrow("write failed");
    });
  });

  describe("markPeerOffline", () => {
    it("marks peer as offline", async () => {
      const peer = createUpdatableRecord();
      (mockCollection.query as jest.Mock).mockResolvedValue([peer]);

      await repository.markPeerOffline("peer-1");

      expect(mockDb.write).toHaveBeenCalled();
      expect(peer.update).toHaveBeenCalled();
    });

    it("throws when mark peer offline fails", async () => {
      mockDb.write.mockRejectedValue(new Error("offline failed"));

      await expect(repository.markPeerOffline("peer-1")).rejects.toThrow(
        "offline failed"
      );
    });
  });

  describe("markPeerOnline", () => {
    it("marks peer as online", async () => {
      const peer = createUpdatableRecord();
      (mockCollection.query as jest.Mock).mockResolvedValue([peer]);

      await repository.markPeerOnline("peer-1");

      expect(mockDb.write).toHaveBeenCalled();
      expect(peer.update).toHaveBeenCalled();
    });

    it("throws when mark peer online fails", async () => {
      mockDb.write.mockRejectedValue(new Error("online failed"));

      await expect(repository.markPeerOnline("peer-1")).rejects.toThrow(
        "online failed"
      );
    });
  });

  describe("isPeerExist", () => {
    it("checks if peer exists", async () => {
      // Arrange
      mockCollection.query().fetch.mockResolvedValue(createTestPeers(1));

      // Act
      const exists = await repository.isPeerExist("peer-1");

      // Assert
      expect(exists).toBe(true);
    });

    it("returns false if peer does not exist", async () => {
      mockCollection.query().fetch.mockResolvedValue([]);

      const exists = await repository.isPeerExist("peer-nonexistent");

      expect(exists).toBe(false);
    });

    it("throws when lookup fails", async () => {
      mockCollection.query().fetch.mockRejectedValue(new Error("lookup failed"));

      await expect(repository.isPeerExist("peer-1")).rejects.toThrow(
        "lookup failed"
      );
    });
  });

  describe("queryPeerById", () => {
    it("queries peer by id", async () => {
      const mockPeer = createTestPeer({
        id: "peer-1",
        username: "Alice",
        isOnline: true,
      });
      mockCollection.query().fetch.mockResolvedValue([mockPeer]);

      const result = await repository.queryPeerById("peer-1");

      expect(result).toEqual(mockPeer);
    });
  });

  describe("queryAllPeers", () => {
    it("returns all peers", async () => {
      // Arrange
      const peers = createTestPeers(2);
      mockCollection.query().fetch.mockResolvedValue(peers);

      // Act
      const result = await repository.queryAllPeers();

      // Assert
      expect(result).toEqual(peers);
    });
  });

  describe("deleteAllPeers", () => {
    it("deletes all peers via batch", async () => {
      // Arrange
      const op1 = { op: "destroy-1" };
      const op2 = { op: "destroy-2" };
      mockCollection.query().fetch.mockResolvedValue([
        createDestroyableRecord(op1),
        createDestroyableRecord(op2),
      ]);

      // Act
      await repository.deleteAllPeers();

      // Assert
      expect(mockDb.batch).toHaveBeenCalledWith(op1, op2);
    });
  });

  describe("getPeerDestroyOps", () => {
    it("returns destroy operations", async () => {
      // Arrange
      const op1 = { op: "destroy-1" };
      const op2 = { op: "destroy-2" };
      mockCollection.query().fetch.mockResolvedValue([
        createDestroyableRecord(op1),
        createDestroyableRecord(op2),
      ]);

      // Act
      const result = await repository.getPeerDestroyOps();

      // Assert
      expect(result).toEqual([op1, op2]);
    });
  });
});
