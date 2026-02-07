import { MessageStatusType } from "@/features/shared";
import { MessageStatusRepository } from "../message-status-repository";

describe("MessageStatusRepository", () => {
  let repository: MessageStatusRepository;
  let mockDb: any;
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
    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    await repository.saveMessageStatus({
      message: { id: "msg-1" } as any,
      user: { id: "user-1", username: "Alice" } as any,
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

    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.updateMessageStatusByMessage("msg-1", MessageStatusType.SENT);

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

    mockDb.write.mockImplementation((fn: any) => fn());

    await repository.updateMessageStatusById("status-1", MessageStatusType.DELIVERED);

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("queries message status by message id", async () => {
    const mockStatus = { id: "status-1", status: MessageStatusType.SENT };
    mockCollection.query().fetch.mockResolvedValue([mockStatus]);

    mockDb.write.mockImplementation((fn: any) =>
      Promise.resolve(fn()).then(() => mockStatus)
    );

    const result = await repository.queryMessageStatusByMessage("msg-1");

    expect(mockDb.write).toHaveBeenCalled();
  });
});
