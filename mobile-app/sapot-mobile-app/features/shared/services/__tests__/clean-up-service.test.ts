import { createDestroyOps } from "@/test/factories/destroy-op.factory";
import { createCleanUpRepositoriesMocks } from "@/test/mocks/clean-up-service.mock-builders";
import { CleanUpService } from "../clean-up-service";

jest.mock("../../database", () => ({
  database: {
    write: jest.fn((fn) => fn()),
    batch: jest.fn(),
  },
}));

describe("CleanUpService", () => {
  let service: CleanUpService;
  const repositoryMocks = createCleanUpRepositoriesMocks();
  let connectionServiceMock: { stop: jest.Mock };
  let discoveryServiceMock: { destroy: jest.Mock };

   
  const { database } = require("../../database");

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(repositoryMocks, createCleanUpRepositoriesMocks());
    connectionServiceMock = { stop: jest.fn() };
    discoveryServiceMock = { destroy: jest.fn() };

    service = new CleanUpService(
      repositoryMocks.guestUserRepository as never,
      repositoryMocks.peerRepository as never,
      repositoryMocks.messageRepository as never,
      repositoryMocks.messageStatusRepository as never,
      repositoryMocks.conversationRepository as never,
      repositoryMocks.conversationParticipantRepository as never
      ,
      connectionServiceMock as never,
      discoveryServiceMock as never
    );
  });

  describe("cleanUp", () => {
    it("batches destroy operations from all repositories", async () => {
      // Arrange
      const convOps = createDestroyOps(1, { op: "conv" });
      const msgOps = createDestroyOps(1, { op: "msg" });
      const statusOps = createDestroyOps(1, { op: "status" });
      const partOps = createDestroyOps(1, { op: "part" });
      const peerOps = createDestroyOps(1, { op: "peer" });
      const guestOps = createDestroyOps(1, { op: "guest" });

      repositoryMocks.conversationRepository.getConversationDestroyOps.mockResolvedValue(convOps);
      repositoryMocks.messageRepository.getAllMessageDestroyOps.mockResolvedValue(msgOps);
      repositoryMocks.messageStatusRepository.getStatusDestroyOps.mockResolvedValue(statusOps);
      repositoryMocks.conversationParticipantRepository.getParticipantDestroyOps.mockResolvedValue(partOps);
      repositoryMocks.peerRepository.getPeerDestroyOps.mockResolvedValue(peerOps);
      repositoryMocks.guestUserRepository.getGuestUserDestroyOps.mockResolvedValue(guestOps);

      // Act
      await service.cleanUp();

      // Assert
      expect(database.write).toHaveBeenCalled();
      expect(database.batch).toHaveBeenCalledWith(
        ...convOps,
        ...msgOps,
        ...statusOps,
        ...partOps,
        ...peerOps,
        ...guestOps
      );
    });

    it("throws when any repository call fails", async () => {
      // Arrange
      repositoryMocks.conversationRepository.getConversationDestroyOps.mockRejectedValue(
        new Error("ops failed")
      );

      // Act / Assert
      await expect(service.cleanUp()).rejects.toThrow("ops failed");
      expect(database.batch).not.toHaveBeenCalled();
    });
  });
});
