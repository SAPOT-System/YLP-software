import { ConversationType } from "@/features/shared";
import { ConversationRepository } from "../conversation-repository";

describe("ConversationRepository", () => {
  let repository: ConversationRepository;
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
      database: {
        write: jest.fn((fn) => fn()),
      },
    };

    mockDb = {
      get: jest.fn().mockReturnValue(mockCollection),
      write: jest.fn((fn) => fn()),
    };

    repository = new ConversationRepository(mockDb);
  });

  it("creates a new conversation", async () => {
    const mockConversation = { id: "conv-1", type: ConversationType.DIRECT };
    mockCollection.create.mockResolvedValue(mockConversation);

    const result = await repository.saveConversation({
      type: ConversationType.DIRECT,
      id: "conv-1",
    });

    expect(mockCollection.create).toHaveBeenCalled();
    expect(result).toEqual(mockConversation);
  });

  it("checks if conversation exists", async () => {
    mockCollection
      .query()
      .fetch.mockResolvedValue([
        { id: "conv-1", type: ConversationType.DIRECT },
      ]);

    const exists = await repository.isConversationExist("conv-1");

    expect(exists).toBe(true);
  });

  it("queries conversation by id", async () => {
    const mockConversation = { id: "conv-1", type: ConversationType.DIRECT };
    mockCollection.query().fetch.mockResolvedValue([mockConversation]);

    const result = await repository.queryConversationById("conv-1");

    expect(result).toEqual(mockConversation);
  });

  it("queries all conversations", async () => {
    const mockConversations = [{ id: "conv-1", type: ConversationType.DIRECT }];
    mockCollection.query().fetch.mockResolvedValue(mockConversations);

    const result = await repository.queryAllConversation();

    expect(result).toEqual(mockConversations);
  });

  it("checks if conversation is direct", async () => {
    const mockConversation = { id: "conv-1", type: ConversationType.DIRECT };
    mockCollection.query.mockResolvedValue([mockConversation]);

    const isDirect = await repository.isDirectConversation("conv-1");

    expect(isDirect).toBe(true);
  });
});
