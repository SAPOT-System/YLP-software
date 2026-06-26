import {
    createCollectionMock,
    createDestroyableRecord,
    createWatermelonDbMock,
} from "@/test/mocks/database.mock-builders";
import type { Database } from "@nozbe/watermelondb";
import { GuestUserRepository } from "../../peer/guest-user-repository";

describe("GuestUserRepository", () => {
  let repository: GuestUserRepository;
  const mockCollection = createCollectionMock();
  const mockDb = createWatermelonDbMock(mockCollection);

  beforeEach(() => {
    jest.clearAllMocks();

    repository = new GuestUserRepository(mockDb as unknown as Database);
  });

  describe("saveGuestUser", () => {
    it("saves a guest user", async () => {
      const createdGuestUser = { id: "guest-1", username: "guest" };
      mockCollection.create.mockResolvedValue(createdGuestUser);

      const result = await repository.saveGuestUser({
        id: "guest-1",
        username: "guest",
        firstName: "Guest",
        lastName: "User",
      });

      expect(mockDb.write).toHaveBeenCalled();
      expect(result).toEqual(createdGuestUser);
    });

    it("throws when save fails", async () => {
      mockCollection.create.mockRejectedValue(new Error("create failed"));

      await expect(
        repository.saveGuestUser({
          id: "guest-1",
          username: "guest",
          firstName: "Guest",
          lastName: "User",
        })
      ).rejects.toThrow("create failed");
    });
  });

  describe("isGuestUserExist", () => {
    it("returns true when guest user exists", async () => {
      // Arrange
      mockCollection.query().fetch.mockResolvedValue([{ id: "guest-1" }]);

      // Act
      const result = await repository.isGuestUserExist("guest-1");

      // Assert
      expect(result).toBe(true);
    });

    it("returns false when guest user does not exist", async () => {
      // Arrange
      mockCollection.query().fetch.mockResolvedValue([]);

      // Act
      const result = await repository.isGuestUserExist("guest-2");

      // Assert
      expect(result).toBe(false);
    });

    it("throws when query fails", async () => {
      // Arrange
      mockCollection.query().fetch.mockRejectedValue(new Error("query failed"));

      // Act / Assert
      await expect(repository.isGuestUserExist("guest-1")).rejects.toThrow(
        "query failed"
      );
    });
  });

  describe("getCurrentGuestUser", () => {
    it("returns first guest user", async () => {
      const guestUsers = [{ id: "guest-1" }, { id: "guest-2" }];
      mockCollection.query().fetch.mockResolvedValue(guestUsers);

      const result = await repository.getCurrentGuestUser();

      expect(result).toEqual(guestUsers[0]);
    });

    it("returns null when no guest users are found", async () => {
      mockCollection.query().fetch.mockResolvedValue([]);

      const result = await repository.getCurrentGuestUser();

      expect(result).toBeNull();
    });

    it("throws when query fails", async () => {
      mockCollection.query().fetch.mockRejectedValue(new Error("query failed"));

      await expect(repository.getCurrentGuestUser()).rejects.toThrow(
        "query failed"
      );
    });
  });

  describe("deleteAllGuestUser", () => {
    it("deletes all guest users", async () => {
      const op1 = { op: "destroy-1" };
      const op2 = { op: "destroy-2" };
      mockCollection.query().fetch.mockResolvedValue([
        createDestroyableRecord(op1),
        createDestroyableRecord(op2),
      ]);

      await repository.deleteAllGuestUser();

      expect(mockDb.write).toHaveBeenCalled();
      expect(mockDb.batch).toHaveBeenCalledWith(op1, op2);
    });

    it("throws when batch delete fails", async () => {
      const op = { op: "destroy" };
      mockCollection.query().fetch.mockResolvedValue([createDestroyableRecord(op)]);
      mockDb.batch.mockRejectedValue(new Error("batch failed"));

      await expect(repository.deleteAllGuestUser()).rejects.toThrow(
        "batch failed"
      );
    });
  });

  describe("getGuestUserDestroyOps", () => {
    it("returns destroy operations for all records", async () => {
      const op1 = { op: "destroy-1" };
      const op2 = { op: "destroy-2" };
      mockCollection.query().fetch.mockResolvedValue([
        createDestroyableRecord(op1),
        createDestroyableRecord(op2),
      ]);

      const result = await repository.getGuestUserDestroyOps();

      expect(result).toEqual([op1, op2]);
    });
  });
});
