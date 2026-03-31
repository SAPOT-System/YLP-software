import { ConversationType } from "@/features/shared";
import { createTestConversation } from "@/test/factories/chat-model.factory";
import {
    createCollectionMock,
    createWatermelonDbMock,
} from "@/test/mocks/database.mock-builders";
import { ConversationRepository } from "../conversation-repository";

describe("ConversationRepository", () => {
  let repository: ConversationRepository;
  let mockCollection: ReturnType<typeof createCollectionMock>;
  let mockDb: ReturnType<typeof createWatermelonDbMock>;

  beforeEach(() => {
    mockCollection = createCollectionMock();
    const collectionWithDatabase = mockCollection as unknown as {
      database: { write: jest.Mock };
    };
    collectionWithDatabase.database = {
      write: jest.fn((fn) => fn()),
    };
    mockDb = createWatermelonDbMock(mockCollection);

    repository = new ConversationRepository(mockDb as never);
  });

  it("creates a new conversation", async () => {
    const mockConversation = createTestConversation({
      id: "conv-1",
      type: ConversationType.DIRECT,
    });
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
        createTestConversation({ id: "conv-1", type: ConversationType.DIRECT }),
      ]);

    const exists = await repository.isConversationExist("conv-1");

    expect(exists).toBe(true);
  });

  it("queries conversation by id", async () => {
    const mockConversation = createTestConversation({
      id: "conv-1",
      type: ConversationType.DIRECT,
    });
    mockCollection.query().fetch.mockResolvedValue([mockConversation]);

    const result = await repository.queryConversationById("conv-1");

    expect(result).toEqual(mockConversation);
  });

  it("queries all conversations", async () => {
    const mockConversations = [
      createTestConversation({ id: "conv-1", type: ConversationType.DIRECT }),
    ];
    mockCollection.query().fetch.mockResolvedValue(mockConversations);

    const result = await repository.queryAllConversation();

    expect(result).toEqual(mockConversations);
  });

  it("checks if conversation is direct", async () => {
    const mockConversation = createTestConversation({
      id: "conv-1",
      type: ConversationType.DIRECT,
    });
    (mockCollection.query as jest.Mock).mockResolvedValue([mockConversation]);

    const isDirect = await repository.isDirectConversation("conv-1");

    expect(isDirect).toBe(true);
  });
});
