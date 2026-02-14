import { Conversation, MessageType, Peer } from "@/features/shared";
import { MessageRepository } from "../message-repository";

describe("MessageRepository", () => {
  let repository: MessageRepository;
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

    repository = new MessageRepository(mockDb);
  });

  it("saves a new message", async () => {
    const mockMessage = {
      id: "msg-1",
      content: "Hello",
      messageType: MessageType.TEXT,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Promise.resolve(fn()).then((_result: any) => mockMessage)
    );

    await repository.saveMessage({
      sender: {
        id: "user-1",
        username: "Alice",
      } as Partial<Peer> as jest.Mocked<Peer>,
      content: "Hello",
      conversation: {
        id: "conv-1",
      } as Partial<Conversation> as jest.Mocked<Conversation>,
      messageId: "msg-1",
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("queries messages by conversation", async () => {
    const mockMessages = [
      { id: "msg-1", content: "Hello" },
      { id: "msg-2", content: "Hi there" },
    ];
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    const result = await repository.queryMessagesByConversation("conv-1");

    expect(result).toEqual(mockMessages);
  });

  it("queries all messages", async () => {
    const mockMessages = [{ id: "msg-1", content: "Hello" }];
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    const result = await repository.queryAllMessages();

    expect(result).toEqual(mockMessages);
  });

  it("supports pagination in queryMessagesByConversation", async () => {
    const mockMessages = [{ id: "msg-1", content: "Hello" }];
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    await repository.queryMessagesByConversation("conv-1", 10, 5);

    expect(mockCollection.query).toHaveBeenCalled();
  });
});
