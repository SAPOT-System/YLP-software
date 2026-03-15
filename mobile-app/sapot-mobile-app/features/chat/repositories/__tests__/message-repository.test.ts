import { Conversation, GuestUser, MessageType, Peer } from "@/features/shared";
import { createTestConversation, createTestMessages } from "@/test/factories/chat-model.factory";
import { createTestGuestUser, createTestPeer } from "@/test/factories/user.factory";
import { createCollectionMock, createWatermelonDbMock } from "@/test/mocks/database.mock-builders";
import { MessageRepository } from "../message-repository";

describe("MessageRepository", () => {
  let repository: MessageRepository;
  let mockCollection: ReturnType<typeof createCollectionMock>;
  let mockDb: ReturnType<typeof createWatermelonDbMock>;

  beforeEach(() => {
    mockCollection = createCollectionMock();
    mockDb = createWatermelonDbMock(mockCollection);

    repository = new MessageRepository(mockDb as never);
  });

  it("saves a new message", async () => {
    const mockMessage = createTestMessages(1, {
      messageType: MessageType.TEXT,
    })[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.write.mockImplementation((fn: any) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Promise.resolve(fn()).then((_result: any) => mockMessage)
    );

    await repository.saveMessage({
      sender: {
        ...createTestPeer({ id: "user-1", username: "Alice" }),
      } as unknown as Partial<Peer> as jest.Mocked<Peer>,
      content: "Hello",
      conversation: {
        ...createTestConversation({ id: "conv-1" }),
      } as unknown as Partial<Conversation> as jest.Mocked<Conversation>,
      messageId: "msg-1",
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("saves a new message sent by a guest user", async () => {
    mockDb.write.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (fn: any) => Promise.resolve(fn())
    );

    await repository.saveMessage({
      sender: {
        ...createTestGuestUser({ id: "guest-1", username: "Guest Alice" }),
      } as unknown as Partial<GuestUser> as jest.Mocked<GuestUser>,
      content: "Hi from guest",
      conversation: {
        ...createTestConversation({ id: "conv-1" }),
      } as unknown as Partial<Conversation> as jest.Mocked<Conversation>,
    });

    expect(mockDb.write).toHaveBeenCalled();
  });

  it("queries messages by conversation", async () => {
    const mockMessages = createTestMessages(2, (index) =>
      index === 0
        ? { id: "msg-1", content: "Hello" }
        : { id: "msg-2", content: "Hi there" }
    );
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    const result = await repository.queryMessagesByConversation("conv-1");

    expect(result).toEqual(mockMessages);
  });

  it("queries all messages", async () => {
    const mockMessages = createTestMessages(1, { id: "msg-1", content: "Hello" });
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    const result = await repository.queryAllMessages();

    expect(result).toEqual(mockMessages);
  });

  it("supports pagination in queryMessagesByConversation", async () => {
    const mockMessages = createTestMessages(1, { id: "msg-1", content: "Hello" });
    mockCollection.query().fetch.mockResolvedValue(mockMessages);

    await repository.queryMessagesByConversation("conv-1", 10, 5);

    expect(mockCollection.query).toHaveBeenCalled();
  });
});
