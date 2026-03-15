import { GuestUser, Message, MessageStatusType, Peer } from "@/features/shared";
import {
    createTestMessage,
    createTestMessageStatus,
} from "@/test/factories/chat-model.factory";
import { createTestGuestUser, createTestPeer } from "@/test/factories/user.factory";
import {
    createCollectionMock,
    createWatermelonDbMock,
} from "@/test/mocks/database.mock-builders";
import { MessageStatusRepository } from "../message-status-repository";

describe("MessageStatusRepository", () => {
  let repository: MessageStatusRepository;
  let mockCollection: ReturnType<typeof createCollectionMock>;
  let mockDb: ReturnType<typeof createWatermelonDbMock>;

  beforeEach(() => {
    mockCollection = createCollectionMock();
    mockDb = createWatermelonDbMock(mockCollection);

    repository = new MessageStatusRepository(mockDb as never);
  });

  it("saves a message status", async () => {
    const mockStatus = createTestMessageStatus({
      id: "status-1",
      status: MessageStatusType.SENT,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    await repository.saveMessageStatus({
      message: {
        ...createTestMessage({ id: "msg-1" }),
      } as unknown as Partial<Message> as jest.Mocked<Message>,
      user: {
        ...createTestPeer({ id: "user-1", username: "Alice" }),
      } as unknown as Partial<Peer> as jest.Mocked<Peer>,
      status: MessageStatusType.SENT,
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("saves a message status for guest user", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) => Promise.resolve(fn()));

    await repository.saveMessageStatus({
      message: {
        ...createTestMessage({ id: "msg-guest" }),
      } as unknown as Partial<Message> as jest.Mocked<Message>,
      user: {
        ...createTestGuestUser({ id: "guest-1", username: "Guest Alice" }),
      } as unknown as Partial<GuestUser> as jest.Mocked<GuestUser>,
      status: MessageStatusType.SENT,
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("updates message status by message id", async () => {
    const mockStatus = createTestMessageStatus({
      id: "status-1",
      status: MessageStatusType.SENT,
    });
    mockCollection.query().fetch.mockResolvedValue([
      {
        ...mockStatus,
        update: jest.fn(),
      },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.updateMessageStatusByMessage(
      "msg-1",
      MessageStatusType.SENT
    );

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("updates message status by id", async () => {
    const mockStatus = createTestMessageStatus({
      id: "status-1",
      status: MessageStatusType.SENT,
    });
    mockCollection.query().fetch.mockResolvedValue([
      {
        ...mockStatus,
        update: jest.fn(),
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.updateMessageStatusById(
      "status-1",
      MessageStatusType.DELIVERED
    );

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("queries message status by message id", async () => {
    const mockStatus = createTestMessageStatus({
      id: "status-1",
      status: MessageStatusType.SENT,
    });
    mockCollection.query().fetch.mockResolvedValue([mockStatus]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    await repository.queryMessageStatusByMessage("msg-1");

    expect(mockDb.write).toHaveBeenCalled();
  });
});
