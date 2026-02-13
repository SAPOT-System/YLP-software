import {
  Conversation,
  ConversationParticipant,
  ConversationParticipantRole,
  Peer,
} from "@/features/shared";
import { ConversationParticipantRepository } from "../conversation-participant-repository";
import { writer } from "@nozbe/watermelondb/decorators";

describe("ConversationParticipantRepository", () => {
  let repository: ConversationParticipantRepository;
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
        write: jest.fn((fn) => fn(writer)),
      },
    };

    mockDb = {
      get: jest.fn().mockReturnValue(mockCollection),
      write: jest.fn((fn) => fn()),
    };

    repository = new ConversationParticipantRepository(mockDb);
  });

  it("saves a conversation participant", async () => {
    const mockParticipant = {
      id: "participant-1",
      role: "member",
    } as Partial<ConversationParticipant> as jest.Mocked<ConversationParticipant>;
    mockCollection.create.mockResolvedValue(mockParticipant);

    await repository.saveConversationParticipant({
      role: ConversationParticipantRole.MEMBER,
      conversation: {
        id: "conv-1",
      } as Partial<Conversation> as jest.Mocked<Conversation>,
      user: {
        id: "user-1",
        username: "Alice",
      } as Partial<Peer> as jest.Mocked<Peer>,
    });

    expect(mockCollection.create).toHaveBeenCalled();
  });

  it("saves multiple conversation participants", async () => {
    mockCollection.create.mockResolvedValue({
      id: "participant-1",
      role: ConversationParticipantRole.MEMBER,
    } as Partial<ConversationParticipant> as jest.Mocked<ConversationParticipant>);

    await repository.saveMultipleConversationParticipant(
      [
        {
          id: "user-1",
          username: "Alice",
        } as Partial<Peer> as jest.Mocked<Peer>,
        { id: "user-2", username: "Bob" } as Partial<Peer> as jest.Mocked<Peer>,
      ],
      { id: "conv-1" } as Partial<Conversation> as jest.Mocked<Conversation>
    );

    expect(mockCollection.create).toHaveBeenCalledTimes(2);
  });

  it("checks if direct conversation exists", async () => {
    mockCollection
      .query()
      .fetch.mockResolvedValue([
        { conversation: { id: "conv-1" } },
        { conversation: { id: "conv-1" } },
      ]);

    const result = await repository.isDirectConversationExists([
      "user-1",
      "user-2",
    ]);

    expect(result).toBeDefined();
  });

  it("queries all participants", async () => {
    const mockParticipants = [
      { id: "participant-1", role: "member" },
      { id: "participant-2", role: "member" },
    ];
    mockCollection.query().fetch.mockResolvedValue(mockParticipants);

    const result = await repository.queryAllParticipants();

    expect(result).toEqual(mockParticipants);
  });
});
