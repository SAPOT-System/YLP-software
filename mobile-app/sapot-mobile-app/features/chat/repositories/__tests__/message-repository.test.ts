import { Conversation, GuestUser, Message, MessageType, Peer } from "@/features/shared";
import { createTestConversation, createTestMessages } from "@/test/factories/chat-model.factory";
import { createTestGuestUser, createTestPeer } from "@/test/factories/user.factory";
import { createCollectionMock, createWatermelonDbMock } from "@/test/mocks/database.mock-builders";
import nacl from "tweetnacl";
import { encodeBase64 } from "tweetnacl-util";
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

    repository.setConversationKey("conv-1", nacl.randomBytes(nacl.secretbox.keyLength));

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

    repository.setConversationKey("conv-1", nacl.randomBytes(nacl.secretbox.keyLength));

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

  describe("conversation key rotation", () => {
    const encryptWith = (key: Uint8Array, plaintext: string): string => {
      const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
      const ciphertext = nacl.secretbox(
        new TextEncoder().encode(plaintext),
        nonce,
        key
      );
      return `ecdh:${encodeBase64(nonce)}:${encodeBase64(ciphertext)}`;
    };

    const messageWith = (content: string) =>
      ({
        id: "msg-1",
        content,
        _raw: { conversation: "conv-1" },
      } as unknown as Message);

    it("decrypts messages encrypted under a previous key after the key rotates", () => {
      const oldKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const newKey = nacl.randomBytes(nacl.secretbox.keyLength);

      // Message stored under the old key.
      const stored = messageWith(encryptWith(oldKey, "secret history"));

      repository.setConversationKey("conv-1", oldKey);
      expect(repository.decryptMessage(stored)).toBe("secret history");

      // Peer key rotates → a new conversation key is derived and set.
      repository.setConversationKey("conv-1", newKey);

      // The old message is still decryptable via the retained historical key.
      expect(repository.decryptMessage(stored)).toBe("secret history");
    });

    it("returns ciphertext unchanged when no candidate key can decrypt it", () => {
      const unrelatedKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const wrongKey = nacl.randomBytes(nacl.secretbox.keyLength);
      const stored = messageWith(encryptWith(unrelatedKey, "nope"));

      repository.setConversationKey("conv-1", wrongKey);

      expect(repository.decryptMessage(stored)).toBe(stored.content);
    });
  });
});
