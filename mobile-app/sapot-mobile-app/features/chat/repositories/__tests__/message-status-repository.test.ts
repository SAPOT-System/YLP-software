import { Message, MessageStatusType, Peer } from "@/features/shared";
import { MessageStatusRepository } from "../message-status-repository";

describe("MessageStatusRepository", () => {
  let repository: MessageStatusRepository;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCollection: any;

  beforeEach(() => {
    mockCollection = {
      create: jest.fn(),
      query: jest.fn().mockReturnValue({
        fetch: jest.fn(),
      }),
    };

    mockDb = {
      get: jest.fn().mockReturnValue(mockCollection),
      write: jest.fn((fn) => fn()),
    };

    repository = new MessageStatusRepository(mockDb);
  });

  it("saves a message status", async () => {
    const mockStatus = { id: "status-1", status: MessageStatusType.SENT };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    await repository.saveMessageStatus({
      message: { id: "msg-1" } as Partial<Message> as jest.Mocked<Message>,
      user: {
        id: "user-1",
        username: "Alice",
      } as Partial<Peer> as jest.Mocked<Peer>,
      status: MessageStatusType.SENT,
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("updates message status by message id", async () => {
    const mockStatus = { id: "status-1", status: MessageStatusType.SENT };
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
    const mockStatus = { id: "status-1", status: MessageStatusType.SENT };
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
    const mockStatus = { id: "status-1", status: MessageStatusType.SENT };
    mockCollection.query().fetch.mockResolvedValue([mockStatus]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    await repository.queryMessageStatusByMessage("msg-1");

    expect(mockDb.write).toHaveBeenCalled();
  });
});
