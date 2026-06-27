import {
    Conversation,
    ConversationParticipant,
    GuestUser,
    Peer,
} from "@/features/shared";
import { ConversationType } from "@/features/shared/core/database/model/Conversation";
import {
    createTestConversation,
    createTestConversationParticipant,
} from "@/test/factories/chat-model.factory";
import { createTestGuestUser, createTestPeer } from "@/test/factories/user.factory";
import {
    createCollectionMock,
    createWatermelonDbMock,
} from "@/test/mocks/database.mock-builders";
import { conversationParticipantId } from "@/features/chat/utils/conversation-participant-id";
import { writer } from "@nozbe/watermelondb/decorators";
import { ConversationParticipantRepository } from "../conversation-participant-repository";

describe("ConversationParticipantRepository", () => {
  let repository: ConversationParticipantRepository;
  let mockCollection: ReturnType<typeof createCollectionMock>;
  let mockDb: ReturnType<typeof createWatermelonDbMock>;

  beforeEach(() => {
    mockCollection = createCollectionMock();
    const collectionWithDatabase = mockCollection as unknown as {
      database: { write: jest.Mock };
    };
    collectionWithDatabase.database = {
      write: jest.fn((fn) => fn(writer)),
    };
    mockDb = createWatermelonDbMock(mockCollection);

    repository = new ConversationParticipantRepository(mockDb as never);
  });

  function makeParticipantRecord() {
    return {
      _raw: {} as Record<string, unknown>,
      conversation: { set: jest.fn() },
      user: { set: jest.fn() },
    } as unknown as jest.Mocked<ConversationParticipant>;
  }

  it("saves a conversation participant", async () => {
    const mockParticipant = createTestConversationParticipant({
      id: "participant-1",
    }) as Partial<ConversationParticipant> as jest.Mocked<ConversationParticipant>;
    const capturedRecord = makeParticipantRecord();
    mockCollection.create.mockImplementation(async (callback) => {
      callback(capturedRecord);
      return mockParticipant;
    });

    await repository.saveConversationParticipant({
      conversation: {
        ...createTestConversation({ id: "conv-1" }),
      } as unknown as Partial<Conversation> as jest.Mocked<Conversation>,
      user: {
        ...createTestPeer({ id: "user-1", username: "Alice" }),
      } as unknown as Partial<Peer> as jest.Mocked<Peer>,
    });

    expect(capturedRecord._raw.id).toBe(conversationParticipantId("conv-1", "user-1"));
  });

  it("saves a conversation participant for guest user", async () => {
    const capturedRecord = makeParticipantRecord();
    mockCollection.create.mockImplementation(async (callback) => {
      callback(capturedRecord);
      return createTestConversationParticipant({
        id: "participant-guest-1",
      }) as Partial<ConversationParticipant> as jest.Mocked<ConversationParticipant>;
    });

    await repository.saveConversationParticipant({
      conversation: {
        ...createTestConversation({ id: "conv-guest" }),
      } as unknown as Partial<Conversation> as jest.Mocked<Conversation>,
      user: {
        ...createTestGuestUser({ id: "guest-1", username: "Guest Alice" }),
      } as unknown as Partial<GuestUser> as jest.Mocked<GuestUser>,
    });

    expect(capturedRecord._raw.id).toBe(conversationParticipantId("conv-guest", "guest-1"));
  });

  it("saves multiple conversation participants", async () => {
    const capturedRecords: jest.Mocked<ConversationParticipant>[] = [];
    mockCollection.create.mockImplementation(async (callback) => {
      const record = makeParticipantRecord();
      capturedRecords.push(record);
      callback(record);
      return createTestConversationParticipant({
        id: "participant-1",
      }) as Partial<ConversationParticipant> as jest.Mocked<ConversationParticipant>;
    });

    await repository.saveMultipleConversationParticipant(
      [
        {
          ...createTestPeer({ id: "user-1", username: "Alice" }),
        } as unknown as Partial<Peer> as jest.Mocked<Peer>,
        {
          ...createTestPeer({ id: "user-2", username: "Bob" }),
        } as unknown as Partial<Peer> as jest.Mocked<Peer>,
      ],
      {
        ...createTestConversation({ id: "conv-1" }),
      } as unknown as Partial<Conversation> as jest.Mocked<Conversation>
    );

    expect(mockCollection.create).toHaveBeenCalledTimes(2);
    expect(capturedRecords[0]._raw.id).toBe(conversationParticipantId("conv-1", "user-1"));
    expect(capturedRecords[1]._raw.id).toBe(conversationParticipantId("conv-1", "user-2"));
  });

  it("checks if direct conversation exists", async () => {
    // First fetch: participant rows (the participant query).
    // Second fetch: conversation rows (the DIRECT/is_deleted verification).
    mockCollection
      .query()
      .fetch.mockResolvedValueOnce([
        { conversation: { id: "conv-1" } },
        { conversation: { id: "conv-1" } },
      ])
      .mockResolvedValueOnce([{ id: "conv-1" }]);

    const result = await repository.isDirectConversationExists([
      "user-1",
      "user-2",
    ]);

    expect(result).toBe("conv-1");
  });

  it("returns undefined when candidate is not a live direct conversation", async () => {
    // Participants match by count, but the conversation verification returns
    // no live DIRECT row (e.g. it's a group conversation or soft-deleted).
    mockCollection
      .query()
      .fetch.mockResolvedValueOnce([
        { conversation: { id: "conv-group" } },
        { conversation: { id: "conv-group" } },
      ])
      .mockResolvedValueOnce([]);

    const result = await repository.isDirectConversationExists([
      "user-1",
      "user-2",
    ]);

    expect(result).toBeUndefined();
  });

  it("finds an SMS conversation when type=SMS is passed", async () => {
    mockCollection
      .query()
      .fetch.mockResolvedValueOnce([
        { conversation: { id: "conv-sms-1" } },
        { conversation: { id: "conv-sms-1" } },
      ])
      .mockResolvedValueOnce([{ id: "conv-sms-1" }]);

    const result = await repository.isDirectConversationExists(
      ["user-1", "user-2"],
      ConversationType.SMS
    );

    expect(result).toBe("conv-sms-1");
  });

  it("returns undefined when type=SMS but candidate is a DIRECT conversation", async () => {
    // Verification fetch returns empty because the type filter (SMS) excludes the DIRECT row.
    mockCollection
      .query()
      .fetch.mockResolvedValueOnce([
        { conversation: { id: "conv-direct-1" } },
        { conversation: { id: "conv-direct-1" } },
      ])
      .mockResolvedValueOnce([]);

    const result = await repository.isDirectConversationExists(
      ["user-1", "user-2"],
      ConversationType.SMS
    );

    expect(result).toBeUndefined();
  });

  it("queries all participants", async () => {
    const mockParticipants = [
      createTestConversationParticipant({ id: "participant-1" }),
      createTestConversationParticipant({ id: "participant-2" }),
    ];
    mockCollection.query().fetch.mockResolvedValue(mockParticipants);

    const result = await repository.queryAllParticipants();

    expect(result).toEqual(mockParticipants);
  });
});
