import {
    ConnectionService,
    Conversation,
    ConversationParticipant,
    ConversationType,
    database,
    Message,
    MessageStatus,
    MessageStatusType,
    Peer,
    PeerService,
    UserStore,
} from "@/features/shared";
import {
    createTestConversation,
    createTestMessage,
    createTestMessages,
    createTestMessageStatus,
    createTestUnsentStatus,
} from "@/test/factories/chat-model.factory";
import { createDestroyOps } from "@/test/factories/destroy-op.factory";
import { createTestDiscoveredService } from "@/test/factories/peer-service.factory";
import { createTestPeer } from "@/test/factories/user.factory";
import { createChatServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import {
    ConversationParticipantRepository,
    ConversationRepository,
    MessageRepository,
    MessageStatusRepository,
} from "../../repositories";
import { DataChatMessageI } from "../../types";
import { ChatService } from "../chat-service";

// Define MessageType enum locally to avoid importing database models with decorators in Jest
enum MessageType {
  TEXT = "text",
  FILE = "file",
  CALL_LOG = "call_log",
  SMS = "sms",
}

// Mock shared dependencies
jest.mock("@/features/shared", () => ({
  ConnectionService: jest.fn(),
  Conversation: jest.fn(),
  ConversationType: {
    DIRECT: "direct",
    GROUP: "group",
    SMS: "sms",
  },
  MessageType: {
    TEXT: "text",
    FILE: "file",
    CALL_LOG: "call_log",
    SMS: "sms",
  },
  database: {
    write: jest.fn(),
    batch: jest.fn(),
  },
  Message: jest.fn(),
  MessageStatus: jest.fn(),
  MessageStatusType: {
    SENDING: "sending",
    SENT: "sent",
    DELIVERED: "delivered",
    READ: "read",
    NOT_SENT: "not_sent",
  },
  Peer: jest.fn(),
  PeerService: jest.fn(),
  UserStore: jest.fn(),
}));

// Mock repositories
jest.mock("../../repositories", () => ({
  ConversationParticipantRepository: jest.fn(),
  ConversationRepository: jest.fn(),
  MessageRepository: jest.fn(),
  MessageStatusRepository: jest.fn(),
}));

describe("ChatService", () => {
  let chatService: ChatService;
  let mockConnectionService: jest.Mocked<ConnectionService>;
  let mockConversationRepository: jest.Mocked<ConversationRepository>;
  let mockConversationParticipantRepository: jest.Mocked<ConversationParticipantRepository>;
  let mockMessageRepository: jest.Mocked<MessageRepository>;
  let mockMessageStatusRepository: jest.Mocked<MessageStatusRepository>;
  let mockPeerService: jest.Mocked<PeerService>;
  let mockUserStore: jest.Mocked<UserStore>;
  let mockDatabase: jest.Mocked<typeof database>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createChatServiceDependencyMocks();
    mockConnectionService =
      mocks.connectionService as unknown as jest.Mocked<ConnectionService>;
    mockConversationRepository =
      mocks.conversationRepository as unknown as jest.Mocked<ConversationRepository>;
    mockConversationParticipantRepository =
      mocks.conversationParticipantRepository as unknown as jest.Mocked<ConversationParticipantRepository>;
    mockMessageRepository =
      mocks.messageRepository as unknown as jest.Mocked<MessageRepository>;
    mockMessageStatusRepository =
      mocks.messageStatusRepository as unknown as jest.Mocked<MessageStatusRepository>;
    mockPeerService = mocks.peerService as unknown as jest.Mocked<PeerService>;
    mockUserStore = mocks.userStore as unknown as jest.Mocked<UserStore>;

    mockDatabase = jest.mocked(database);
    mockDatabase.write.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (fn: (writer: any) => Promise<any>) => await fn({} as any)
    );
    mockMessageRepository.prepareMessageCreate.mockReturnValue(
      createTestMessage({ id: "msg-1" }) as unknown as Message
    );
    mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
      createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus
    );

    // Mock constructors
    jest
      .mocked(ConnectionService)
      .mockImplementation(() => mockConnectionService);
    jest
      .mocked(ConversationRepository)
      .mockImplementation(() => mockConversationRepository);
    jest
      .mocked(ConversationParticipantRepository)
      .mockImplementation(() => mockConversationParticipantRepository);
    jest
      .mocked(MessageRepository)
      .mockImplementation(() => mockMessageRepository);
    jest
      .mocked(MessageStatusRepository)
      .mockImplementation(() => mockMessageStatusRepository);
    jest.mocked(PeerService).mockImplementation(() => mockPeerService);
    jest.mocked(UserStore).mockImplementation(() => mockUserStore);

    // Create service instance
    chatService = new ChatService(
      mockConnectionService,
      mockConversationRepository,
      mockConversationParticipantRepository,
      mockMessageRepository,
      {
        setConversationKey: jest.fn(),
        getCandidateKeys: jest.fn(() => []),
        getCurrentKey: jest.fn(),
        onConversationKeySet: jest.fn(() => () => {}),
        clearConversationKeys: jest.fn(),
        captureGuestKeysForMigration: jest.fn(),
        hasMigrationKeys: jest.fn(() => false),
        tryDecryptWithMigrationKeys: jest.fn(() => null),
        clearMigrationKeys: jest.fn(),
      } as never,
      mockMessageStatusRepository,
      mockPeerService,
      mockUserStore,
      { syncNow: jest.fn().mockResolvedValue(undefined) }
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided dependencies", () => {
      expect(chatService).toBeInstanceOf(ChatService);
    });
  });

  describe("connect", () => {
    it("should connect to a peer successfully", async () => {
      const peerId = "peer-1";
      const mockPeer = createTestPeer({ id: peerId, username: "peeruser" }) as unknown as Peer;
      const mockDiscoveredPeer = createTestDiscoveredService({
        id: peerId,
        ipAddress: "192.168.1.101",
        port: 8080,
        serviceName: "peer-device",
      });

      mockPeerService.findPeerById.mockResolvedValue(mockPeer);
      mockPeerService.findDiscoveredPeerById.mockReturnValue(
        mockDiscoveredPeer
      );

      await chatService.connect(peerId);

      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(peerId);
      expect(mockPeerService.findDiscoveredPeerById).toHaveBeenCalledWith(
        peerId
      );
      expect(mockConnectionService.connectToPeer).toHaveBeenCalledWith(
        peerId,
        "192.168.1.101",
        8080,
        ["192.168.1.101"]
      );
    });

    it("should throw error if peer not found", async () => {
      const peerId = "non-existent-peer";
      mockPeerService.findPeerById.mockResolvedValue(null as unknown as Peer);

      await expect(chatService.connect(peerId)).rejects.toThrow(
        "Peer not found"
      );
    });

    it("should fall back to direct connect if peer not discovered", async () => {
      const peerId = "peer-1";
      const mockPeer = createTestPeer({ id: peerId, username: "peeruser" }) as unknown as Peer;

      mockPeerService.findPeerById.mockResolvedValue(mockPeer);
      mockPeerService.findDiscoveredPeerById.mockReturnValue(undefined);

      await chatService.connect(peerId);

      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(peerId);
      expect(mockPeerService.findDiscoveredPeerById).toHaveBeenCalledWith(
        peerId
      );
      expect(mockConnectionService.connectToPeer).toHaveBeenCalledWith(peerId);
    });
  });

  describe("disconnect", () => {
    it("should clear peer and conversation state", () => {
      chatService.disconnect();

      // We can't directly access private properties, but we can test behavior
      // that depends on these properties being cleared
      expect(() => chatService.disconnect()).not.toThrow();
    });

    it("should handle errors gracefully", () => {
      // Mock an error scenario
      jest.spyOn(console, "error").mockImplementation();

      expect(() => chatService.disconnect()).not.toThrow();
    });
  });

  describe("handleIncomingChatMessage", () => {
    it("should handle incoming message for existing conversation", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        from: "peer-1",
        to: "peer-2",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
        senderProfile: { username: "sender", firstName: "Sender" },
      };

      const mockSender = createTestPeer({ id: "peer-1", username: "sender" }) as unknown as Peer;
      const mockConversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      }) as unknown as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(true);
      mockConversationRepository.queryConversationById.mockResolvedValue(
        mockConversation
      );
      mockMessageRepository.saveMessage.mockResolvedValue({
        ...createTestMessage({ id: "msg-1" }),
      } as unknown as Message);
      mockMessageRepository.prepareMessageCreate.mockReturnValue(
        createTestMessage({ id: "msg-1" }) as unknown as Message
      );
      mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
        createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus
      );

      await chatService.handleIncomingChatMessage(mockData);

      expect(mockPeerService.findPeerById).toHaveBeenCalledWith("peer-1");
      expect(
        mockConversationRepository.isConversationExist
      ).toHaveBeenCalledWith("conv-1");
      expect(
        mockConversationRepository.queryConversationById
      ).toHaveBeenCalledWith("conv-1");
      expect(mockMessageRepository.prepareMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: mockSender,
          content: "Hello World",
          conversation: mockConversation,
          messageId: "msg-1",
        })
      );
      expect(
        mockMessageStatusRepository.prepareMessageStatusCreate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.any(Object),
          user: mockUserStore.user,
          status: MessageStatusType.DELIVERED,
        })
      );
      expect(mockDatabase.write).toHaveBeenCalled();
      expect(mockDatabase.batch).toHaveBeenCalled();
      expect(mockConnectionService.sendAckMessage).toHaveBeenCalledWith(
        "peer-1",
        expect.objectContaining({
          messageId: "msg-1",
          from: "test-user-id",
          to: "peer-1",
        })
      );
    });

    it("should create new conversation for new chat", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        from: "peer-1",
        to: "peer-2",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
        senderProfile: { username: "sender", firstName: "Sender" },
      };

      const mockSender = createTestPeer({ id: "peer-1", username: "sender" }) as unknown as Peer;
      const mockConversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      }) as unknown as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(false);

      // Mock database write transaction
      mockDatabase.write.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (writer: any) => Promise<any>) => await fn({} as any)
      );
      mockConversationRepository.saveConversation.mockResolvedValue(
        mockConversation
      );
      mockConversationParticipantRepository.saveMultipleConversationParticipant.mockResolvedValue();
      mockMessageRepository.saveMessage.mockResolvedValue({
        ...createTestMessage({ id: "msg-1" }),
      } as unknown as Message);
      mockMessageRepository.prepareMessageCreate.mockReturnValue(
        createTestMessage({ id: "msg-1" }) as unknown as Message
      );
      mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
        createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus
      );

      await chatService.handleIncomingChatMessage(mockData);

      expect(mockConversationRepository.saveConversation).toHaveBeenCalledWith(
        { type: ConversationType.DIRECT, id: "conv-1" },
        true
      );
      expect(
        mockConversationParticipantRepository.saveMultipleConversationParticipant
      ).toHaveBeenCalled();
      expect(mockDatabase.batch).toHaveBeenCalled();
    });

    it("should throw error if handling fails", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        from: "peer-1",
        to: "peer-2",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
        senderProfile: { username: "sender", firstName: "Sender" },
      };

      mockPeerService.findPeerById.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        chatService.handleIncomingChatMessage(mockData)
      ).rejects.toThrow("Database error");
    });

    it("should reuse existing SMS conversation for incoming SMS message", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello via SMS",
        conversationId: "sms-conv-id-from-server",
        messageId: "msg-sms-1",
        from: "peer-1",
        to: "test-user-id",
        sentAt: new Date(),
        messageType: MessageType.SMS,
        senderProfile: { username: "sender", firstName: "Sender" },
      };

      const mockSender = createTestPeer({ id: "peer-1", username: "sender" }) as unknown as Peer;
      const existingSmsConversation = createTestConversation({
        id: "existing-sms-conv",
        type: ConversationType.SMS,
      }) as unknown as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(false);
      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        "existing-sms-conv"
      );
      mockConversationRepository.queryConversationById.mockResolvedValue(
        existingSmsConversation
      );
      mockMessageRepository.prepareMessageCreate.mockReturnValue(
        createTestMessage({ id: "msg-sms-1" }) as unknown as Message
      );
      mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
        createTestMessageStatus({ id: "status-sms-1" }) as unknown as MessageStatus
      );

      await chatService.handleIncomingChatMessage(mockData);

      expect(
        mockConversationParticipantRepository.isDirectConversationExists
      ).toHaveBeenCalledWith(["peer-1", "test-user-id"], ConversationType.SMS);
      expect(mockConversationRepository.saveConversation).not.toHaveBeenCalled();
      expect(mockConversationRepository.queryConversationById).toHaveBeenCalledWith(
        "existing-sms-conv"
      );
    });

    it("should create SMS-typed conversation when no existing SMS conversation found", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello via SMS",
        conversationId: "sms-conv-id-from-server",
        messageId: "msg-sms-2",
        from: "peer-1",
        to: "test-user-id",
        sentAt: new Date(),
        messageType: MessageType.SMS,
        senderProfile: { username: "sender", firstName: "Sender" },
      };

      const mockSender = createTestPeer({ id: "peer-1", username: "sender" }) as unknown as Peer;
      const newSmsConversation = createTestConversation({
        id: "sms-conv-id-from-server",
        type: ConversationType.SMS,
      }) as unknown as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(false);
      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        undefined
      );
      mockDatabase.write.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (writer: any) => Promise<any>) => await fn({} as any)
      );
      mockConversationRepository.saveConversation.mockResolvedValue(newSmsConversation);
      mockConversationParticipantRepository.saveMultipleConversationParticipant.mockResolvedValue();
      mockMessageRepository.prepareMessageCreate.mockReturnValue(
        createTestMessage({ id: "msg-sms-2" }) as unknown as Message
      );
      mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
        createTestMessageStatus({ id: "status-sms-2" }) as unknown as MessageStatus
      );

      await chatService.handleIncomingChatMessage(mockData);

      expect(mockConversationRepository.saveConversation).toHaveBeenCalledWith(
        { type: ConversationType.SMS, id: "sms-conv-id-from-server" },
        true
      );
    });
  });

  describe("handleAckMessage", () => {
    it("should update message status to delivered", async () => {
      const messageId = "msg-1";

      await chatService.handleAckMessage(messageId);

      expect(
        mockMessageStatusRepository.updateMessageStatusByMessage
      ).toHaveBeenCalledWith(messageId, MessageStatusType.DELIVERED);
    });

    it("should throw error if update fails", async () => {
      const messageId = "msg-1";
      mockMessageStatusRepository.updateMessageStatusByMessage.mockRejectedValue(
        new Error("Database error")
      );

      await expect(chatService.handleAckMessage(messageId)).rejects.toThrow(
        "Database error"
      );
    });

    it("cancels ack timeout when DELIVERED arrives before expiry", async () => {
      jest.useFakeTimers();
      const message = "Hello World";
      const mockConversation = createTestConversation({ id: "conv-1", type: ConversationType.DIRECT });
      const mockMessage = createTestMessage({ id: "msg-1", content: message, createdAt: new Date(), messageType: MessageType.TEXT }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      (chatService as unknown as { peer: Peer }).peer = {
        ...createTestPeer({ id: "peer-1", username: "peeruser" }),
      } as unknown as Peer;
      (chatService as unknown as { conversation: typeof mockConversation }).conversation = mockConversation as unknown as typeof mockConversation;

      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(mockMessageStatus);
      mockConnectionService.sendChatMessage.mockReturnValue("ws");

      await chatService.sendChatMessage(message);

      // ACK arrives before 12s
      await chatService.handleAckMessage("msg-1");
      jest.advanceTimersByTime(13000);
      await Promise.resolve(); // flush microtasks

      // Should not flip to NOT_SENT after ACK clears timeout.
      expect(mockMessageStatusRepository.updateMessageStatusByMessage).toHaveBeenCalledWith(
        "msg-1",
        MessageStatusType.DELIVERED
      );
      expect(mockMessageStatusRepository.updateMessageStatusById).not.toHaveBeenCalledWith(
        "status-1",
        MessageStatusType.NOT_SENT
      );

      jest.useRealTimers();
    });
  });

  describe("ACK timeout", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      (chatService as unknown as { peer: Peer }).peer = {
        ...createTestPeer({ id: "peer-1", username: "peeruser" }),
      } as unknown as Peer;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("flips status to NOT_SENT when no DELIVERED arrives within 12 seconds", async () => {
      const message = "Hello";
      const mockConversation = createTestConversation({ id: "conv-1", type: ConversationType.DIRECT });
      const mockMessage = createTestMessage({ id: "msg-1", content: message, createdAt: new Date(), messageType: MessageType.TEXT }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      (chatService as unknown as { conversation: typeof mockConversation }).conversation = mockConversation as unknown as typeof mockConversation;
      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(mockMessageStatus);

      await chatService.sendChatMessage(message);

      // Advance past 12-second timeout
      jest.advanceTimersByTime(12001);
      await Promise.resolve(); // flush microtasks

      expect(mockMessageStatusRepository.updateToNotSentIfStillPendingById).toHaveBeenCalledWith(
        "status-1"
      );
    });

    it("does not flip to NOT_SENT when DELIVERED arrives before 12 seconds", async () => {
      const message = "Hello";
      const mockConversation = createTestConversation({ id: "conv-1", type: ConversationType.DIRECT });
      const mockMessage = createTestMessage({ id: "msg-1", content: message, createdAt: new Date(), messageType: MessageType.TEXT }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      (chatService as unknown as { conversation: typeof mockConversation }).conversation = mockConversation as unknown as typeof mockConversation;
      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(mockMessageStatus);

      await chatService.sendChatMessage(message);

      // DELIVERED arrives at 5s
      jest.advanceTimersByTime(5000);
      await chatService.handleAckMessage("msg-1");

      // Advance past where the timeout would have fired
      jest.advanceTimersByTime(8000);
      await Promise.resolve();

      const allCalls = mockMessageStatusRepository.updateMessageStatusById.mock.calls;
      const notSentCalls = allCalls.filter(([, status]) => status === MessageStatusType.NOT_SENT);
      expect(notSentCalls).toHaveLength(0);
    });
  });

  describe("sendChatMessage", () => {
    beforeEach(() => {
      // Set up peer state for sending messages
      (chatService as unknown as { peer: Peer }).peer = {
        ...createTestPeer({ id: "peer-1", username: "peeruser" }),
      } as unknown as Peer;
    });

    it("should send message with existing conversation", async () => {
      const message = "Hello World";
      const mockConversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      });
      const mockMessage = createTestMessage({
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      (chatService as unknown as { conversation: Conversation }).conversation =
        mockConversation as unknown as Conversation;
      mockMessageRepository.prepareMessageCreate.mockReturnValue(mockMessage);
      mockMessageStatusRepository.prepareMessageStatusCreate.mockReturnValue(
        mockMessageStatus
      );
      mockConnectionService.sendChatMessage.mockReturnValue("webrtc");

      const result = await chatService.sendChatMessage(message);

      expect(mockMessageRepository.prepareMessageCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: mockUserStore.user,
          content: message,
          conversation: mockConversation,
          messageType: undefined,
        })
      );
      expect(
        mockMessageStatusRepository.prepareMessageStatusCreate
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          message: mockMessage,
          user: mockUserStore.user,
          status: MessageStatusType.SENDING,
        })
      );
      expect(mockConnectionService.sendChatMessage).toHaveBeenCalledWith(
        "peer-1",
        expect.objectContaining({
          message: message,
          conversationId: "conv-1",
          messageId: "msg-1",
          from: "test-user-id",
          to: "peer-1",
        })
      );
      expect(
        mockMessageStatusRepository.updateMessageStatusById
      ).toHaveBeenCalledWith("status-1", MessageStatusType.SENT);
      expect(result.conversationId).toBe("conv-1");
    });

    it("should create new conversation if none exists", async () => {
      const message = "Hello World";
      const mockConversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      }) as unknown as Conversation;
      const mockMessage = createTestMessage({
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        undefined
      );
      mockDatabase.write.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (writer: any) => Promise<any>) => await fn({} as any)
      );
      mockConversationRepository.saveConversation.mockResolvedValue(
        mockConversation
      );
      mockConversationParticipantRepository.saveMultipleConversationParticipant.mockResolvedValue();
      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(
        mockMessageStatus
      );

      const result = await chatService.sendChatMessage(message);

      expect(mockConversationRepository.saveConversation).toHaveBeenCalled();
      expect(result.conversationId).toBe("conv-1");
    });

    it("should handle send failure and update status to not sent", async () => {
      const message = "Hello World";
      const mockConversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      });
      const mockMessage = createTestMessage({
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      }) as Message;
      const mockMessageStatus = createTestMessageStatus({ id: "status-1" }) as unknown as MessageStatus;

      (chatService as unknown as { conversation: Conversation }).conversation =
        mockConversation as unknown as Conversation;
      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(
        mockMessageStatus
      );
      mockConnectionService.sendChatMessage.mockImplementation(() => {
        throw new Error("Send failed");
      });

      await chatService.sendChatMessage(message);

      expect(
        mockMessageStatusRepository.updateMessageStatusById
      ).toHaveBeenCalledWith("status-1", MessageStatusType.NOT_SENT);
    });

    it("should throw error if no peer state", async () => {
      (chatService as unknown as { peer: Peer | undefined }).peer = undefined;

      await expect(chatService.sendChatMessage("Hello")).rejects.toThrow(
        "No peer state stored"
      );
    });
  });

  describe("findPeerIdByChatId", () => {
    it("should return peer id for given chat id", async () => {
      const chatId = "conv-1";
      const mockParticipants = [
        { user: { id: "peer-1", username: "peeruser" } },
      ] as unknown as ConversationParticipant[];

      mockConversationParticipantRepository.queryPeerByChatId.mockResolvedValue(
        mockParticipants
      );

      const result = await chatService.findPeerIdByChatId(chatId);

      expect(
        mockConversationParticipantRepository.queryPeerByChatId
      ).toHaveBeenCalledWith(chatId, "test-user-id");
      expect(result).toBe("peer-1");
    });

    it("should throw error if query fails", async () => {
      mockConversationParticipantRepository.queryPeerByChatId.mockRejectedValue(
        new Error("Database error")
      );

      await expect(chatService.findPeerIdByChatId("conv-1")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("findChatByPeer", () => {
    it("should return conversation id for given peer", async () => {
      const peerId = "peer-1";

      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        "conv-1"
      );

      const result = await chatService.findChatByPeer(peerId);

      expect(
        mockConversationParticipantRepository.isDirectConversationExists
      ).toHaveBeenCalledWith([peerId, "test-user-id"]);
      expect(result).toBe("conv-1");
    });

    it("should return undefined if no conversation found", async () => {
      mockConversationParticipantRepository.queryConversationByPeer.mockResolvedValue(
        []
      );

      const result = await chatService.findChatByPeer("peer-1");

      expect(result).toBeUndefined();
    });
  });

  describe("saveCallLogWithReceipts", () => {
    it("should reject when senderId is neither current user nor peerId", async () => {
      await expect(
        chatService.saveCallLogWithReceipts({
          peerId: "peer-1",
          content: "Missed call from Peer",
          senderId: "invalid-sender-id",
        })
      ).rejects.toThrow("senderId must be current user or peerId");

      expect(mockMessageRepository.saveMessage).not.toHaveBeenCalled();
    });

    it("should create call-log message and sender delivered receipt", async () => {
      const peer = createTestPeer({ id: "peer-1", username: "peeruser" }) as unknown as Peer;
      const conversation = createTestConversation({
        id: "conv-1",
        type: ConversationType.DIRECT,
      }) as unknown as Conversation;
      const savedMessage = createTestMessage({
        id: "msg-1",
        content: "Missed call from Peer",
        messageType: MessageType.CALL_LOG,
      }) as unknown as Message;

      mockPeerService.findPeerById.mockResolvedValue(peer);
      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        "conv-1"
      );
      mockConversationRepository.queryConversationById.mockResolvedValue(
        conversation
      );
      mockMessageRepository.queryMessageById.mockResolvedValue(undefined);
      mockMessageRepository.saveMessage.mockResolvedValue(savedMessage);

      await chatService.saveCallLogWithReceipts({
        peerId: "peer-1",
        content: "Missed call from Peer",
        senderId: "test-user-id",
        messageId: "call-log-1",
      });

      expect(mockMessageRepository.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "Missed call from Peer",
          conversation,
          messageId: "call-log-1",
        })
      );
      expect(mockMessageStatusRepository.saveMessageStatus).toHaveBeenCalledTimes(1);
      expect(mockMessageStatusRepository.saveMessageStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          message: savedMessage,
          status: MessageStatusType.DELIVERED,
        })
      );
    });

    it("should skip call-log save when message already exists", async () => {
      const existingMessage = createTestMessage({
        id: "call-log-1",
        content: "Missed call from Peer",
        messageType: MessageType.CALL_LOG,
      }) as unknown as Message;

      mockMessageRepository.queryMessageById.mockResolvedValue(existingMessage);

      await chatService.saveCallLogWithReceipts({
        peerId: "peer-1",
        content: "Missed call from Peer",
        senderId: "test-user-id",
        messageId: "call-log-1",
      });

      expect(mockMessageRepository.queryMessageById).toHaveBeenCalledWith(
        "call-log-1"
      );
      expect(mockMessageRepository.saveMessage).not.toHaveBeenCalled();
      expect(mockMessageStatusRepository.saveMessageStatus).not.toHaveBeenCalled();
    });
  });

  describe("getAllConversations", () => {
    it("should return all conversations", async () => {
      const mockConversations = [
        createTestConversation({ id: "conv-1", type: ConversationType.DIRECT }),
        createTestConversation({ id: "conv-2", type: ConversationType.DIRECT }),
      ] as unknown as Conversation[];

      mockConversationRepository.queryAllConversation.mockResolvedValue(
        mockConversations
      );

      const result = await chatService.getAllConversations();

      expect(
        mockConversationRepository.queryAllConversation
      ).toHaveBeenCalled();
      expect(result).toEqual(mockConversations);
    });
  });

  describe("getMessagesFromConversation", () => {
    it("should return messages from conversation", async () => {
      const conversationId = "conv-1";
      const mockMessages = createTestMessages(2, (index) =>
        index === 0
          ? { id: "msg-1", content: "Hello" }
          : { id: "msg-2", content: "Hi" }
      ) as unknown as Message[];

      mockMessageRepository.queryMessagesByConversation.mockResolvedValue(
        mockMessages
      );

      const result = await chatService.getMessagesFromConversation(
        conversationId
      );

      expect(
        mockMessageRepository.queryMessagesByConversation
      ).toHaveBeenCalledWith(conversationId);
      expect(result).toEqual(mockMessages);
    });
  });

  describe("getMessageStatus", () => {
    it("should return message status", async () => {
      const messageId = "msg-1";
      const mockStatus = createTestMessageStatus({
        id: "status-1",
        status: MessageStatusType.DELIVERED,
      }) as unknown as MessageStatus;

      mockMessageStatusRepository.queryMessageStatusByMessage.mockResolvedValue(
        mockStatus
      );

      const result = await chatService.getMessageStatus(messageId);

      expect(
        mockMessageStatusRepository.queryMessageStatusByMessage
      ).toHaveBeenCalledWith(messageId);
      expect(result).toEqual(mockStatus);
    });
  });

  describe("getAllNotSentMessageForPeer", () => {
    it("should return unsent messages for peer", async () => {
      const peerId = "peer-1";
      const mockMessages = createTestMessages(2, (index) =>
        index === 0
          ? { id: "msg-1", content: "Hello" }
          : { id: "msg-2", content: "Hi" }
      ) as unknown as Message[];
      const mockUnsentStatuses = [
        createTestUnsentStatus({ message: { id: "msg-1" } }),
      ] as unknown as MessageStatus[];

      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        "conv-1"
      );
      mockMessageRepository.queryMessagesByConversation.mockResolvedValue(
        mockMessages
      );
      mockMessageStatusRepository.queryNotSentByMessages.mockResolvedValue(
        mockUnsentStatuses
      );

      const result = await chatService.getAllNotSentMessageForPeer(peerId);

      expect(
        mockConversationParticipantRepository.isDirectConversationExists
      ).toHaveBeenCalledWith([peerId, "test-user-id"]);
      expect(
        mockMessageRepository.queryMessagesByConversation
      ).toHaveBeenCalledWith("conv-1");
      expect(
        mockMessageStatusRepository.queryNotSentByMessages
      ).toHaveBeenCalledWith(["msg-1", "msg-2"]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("msg-1");
    });

    it("should return empty array if no conversation exists", async () => {
      mockConversationParticipantRepository.queryConversationByPeer.mockResolvedValue(
        []
      );

      const result = await chatService.getAllNotSentMessageForPeer("peer-1");

      expect(result).toEqual([]);
    });
  });

  describe("tryResendMessage", () => {
    it("should resend message successfully", async () => {
      const mockMessage = createTestMessage({
        id: "msg-1",
        content: "Hello",
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      }) as Message;
      mockConnectionService.isWebSocketAllowed.mockReturnValue(false);
      mockConnectionService.sendChatMessage.mockReturnValue("webrtc");

      await chatService.tryResendMessage(mockMessage, "peer-1", {
        ipAddress: "192.168.1.101",
        port: 8080,
      });

      expect(mockConnectionService.connectToPeer).toHaveBeenCalledWith(
        "peer-1",
        "192.168.1.101",
        8080
      );
      expect(mockConnectionService.waitForDataChannel).toHaveBeenCalledWith("peer-1");
      expect(mockConnectionService.sendChatMessage).toHaveBeenCalledWith(
        "peer-1",
        expect.objectContaining({
          message: "Hello",
          conversationId: "conv-1",
          messageId: "msg-1",
        })
      );
      expect(
        mockMessageStatusRepository.updateMessageStatusByMessage
      ).toHaveBeenCalledWith("msg-1", MessageStatusType.SENT);
    });

    it("should throw error if resend fails", async () => {
      const mockMessage = createTestMessage({
        id: "msg-1",
        content: "Hello",
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      }) as Message;

      mockConnectionService.isWebSocketAllowed.mockReturnValue(false);
      mockConnectionService.connectToPeer.mockRejectedValue(
        new Error("Connection failed")
      );

      await expect(
        chatService.tryResendMessage(mockMessage, "peer-1", {
          ipAddress: "192.168.1.101",
          port: 8080,
        })
      ).rejects.toThrow("Connection failed");
    });
  });

  describe("cleanUp", () => {
    it("should clear peer and conversation state", () => {
      chatService.cleanUp();

      // Test that cleanup doesn't throw errors
      expect(() => chatService.cleanUp()).not.toThrow();
    });
  });

  describe("deleteAllConversations", () => {
    it("should delete all conversations, messages, and statuses", async () => {
      const mockOps = createDestroyOps(1);

      mockDatabase.write.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: (writer: any) => Promise<any>) => await fn({} as any)
      );
      mockConversationRepository.getConversationDestroyOps.mockResolvedValue(
        mockOps as never
      );
      mockMessageRepository.getAllMessageDestroyOps.mockResolvedValue(
        mockOps as never
      );
      mockMessageStatusRepository.getStatusDestroyOps.mockResolvedValue(
        mockOps as never
      );
      mockConversationParticipantRepository.getParticipantDestroyOps.mockResolvedValue(
        mockOps as never
      );
      mockDatabase.batch = jest.fn();

      await chatService.deleteAllConversations();

      expect(mockDatabase.write).toHaveBeenCalled();
      expect(mockDatabase.batch).toHaveBeenCalled();
    });
  });
});
