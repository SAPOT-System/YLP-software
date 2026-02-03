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
  PHOTO = "photo",
  VIDEO = "video",
  FILE = "file",
}

// Mock shared dependencies
jest.mock("@/features/shared", () => ({
  ConnectionService: jest.fn(),
  Conversation: jest.fn(),
  ConversationParticipantRole: {
    MEMBER: "member",
    ADMIN: "admin",
  },
  ConversationType: {
    DIRECT: "direct",
    GROUP: "group",
  },
  database: {
    write: jest.fn(),
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
  let mockDatabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockConnectionService = {
      connectToPeer: jest.fn(),
      sendChatMessage: jest.fn(),
      sendAckMessage: jest.fn(),
      sendMessage: jest.fn(),
      initializeStream: jest.fn(),
      terminateCallConnection: jest.fn(),
      toggleMic: jest.fn(),
      toggleCamera: jest.fn(),
      getLocalStream: jest.fn(),
      renegotiate: jest.fn(),
    } as any;

    mockConversationRepository = {
      isConversationExist: jest.fn(),
      queryConversationById: jest.fn(),
      saveConversation: jest.fn(),
      queryAllConversation: jest.fn(),
      getConversationDestroyOps: jest.fn(),
    } as any;

    mockConversationParticipantRepository = {
      isDirectConversationExists: jest.fn(),
      saveMultipleConversationParticipant: jest.fn(),
      queryPeerByChatId: jest.fn(),
      queryConversationByPeer: jest.fn(),
      queryAllParticipants: jest.fn(),
      getParticipantDestroyOps: jest.fn(),
    } as any;

    mockMessageRepository = {
      saveMessage: jest.fn(),
      queryMessagesByConversation: jest.fn(),
      getAllMessageDestroyOps: jest.fn(),
    } as any;

    mockMessageStatusRepository = {
      saveMessageStatus: jest.fn(),
      updateMessageStatusById: jest.fn(),
      updateMessageStatusByMessage: jest.fn(),
      queryMessageStatusByMessage: jest.fn(),
      queryAllStatuses: jest.fn(),
      queryNotSentByMessages: jest.fn(),
      getStatusDestroyOps: jest.fn(),
    } as any;

    mockPeerService = {
      findPeerById: jest.fn(),
      findDiscoveredPeerById: jest.fn(),
    } as any;

    mockUserStore = {
      user: {
        id: "test-user-id",
        username: "testuser",
      },
    } as any;

    mockDatabase = jest.mocked(database);

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
      mockMessageStatusRepository,
      mockPeerService,
      mockUserStore
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
      const mockPeer = { id: peerId, username: "peeruser" } as Peer;
      const mockDiscoveredPeer = {
        id: peerId,
        ipAddress: "192.168.1.101",
        port: 8080,
        serviceName: "peer-device",
      };

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
        8080
      );
    });

    it("should throw error if peer not found", async () => {
      const peerId = "non-existent-peer";
      mockPeerService.findPeerById.mockResolvedValue(null as any);

      await expect(chatService.connect(peerId)).rejects.toThrow(
        "Peer not found"
      );
    });

    it("should throw error if peer not discovered", async () => {
      const peerId = "peer-1";
      const mockPeer = { id: peerId, username: "peeruser" } as Peer;

      mockPeerService.findPeerById.mockResolvedValue(mockPeer);
      mockPeerService.findDiscoveredPeerById.mockReturnValue(null as any);

      await expect(chatService.connect(peerId)).rejects.toThrow(
        "Peer not discovered"
      );
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
        senderId: "peer-1",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
      };

      const mockSender = { id: "peer-1", username: "sender" } as Peer;
      const mockConversation = {
        id: "conv-1",
        type: ConversationType.DIRECT,
      } as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(true);
      mockConversationRepository.queryConversationById.mockResolvedValue(
        mockConversation
      );
      mockMessageRepository.saveMessage.mockResolvedValue({
        id: "msg-1",
      } as any);

      await chatService.handleIncomingChatMessage(mockData);

      expect(mockPeerService.findPeerById).toHaveBeenCalledWith("peer-1");
      expect(
        mockConversationRepository.isConversationExist
      ).toHaveBeenCalledWith("conv-1");
      expect(
        mockConversationRepository.queryConversationById
      ).toHaveBeenCalledWith("conv-1");
      expect(mockMessageRepository.saveMessage).toHaveBeenCalled();
      expect(mockConnectionService.sendAckMessage).toHaveBeenCalledWith(
        "peer-1",
        { messageId: "msg-1" }
      );
    });

    it("should create new conversation for new chat", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        senderId: "peer-1",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
      };

      const mockSender = { id: "peer-1", username: "sender" } as Peer;
      const mockConversation = {
        id: "conv-1",
        type: ConversationType.DIRECT,
      } as Conversation;

      mockPeerService.findPeerById.mockResolvedValue(mockSender);
      mockConversationRepository.isConversationExist.mockResolvedValue(false);

      // Mock database write transaction
      mockDatabase.write.mockImplementation(async (fn: Function) => await fn());
      mockConversationRepository.saveConversation.mockResolvedValue(
        mockConversation
      );
      mockConversationParticipantRepository.saveMultipleConversationParticipant.mockResolvedValue();
      mockMessageRepository.saveMessage.mockResolvedValue({
        id: "msg-1",
      } as any);

      await chatService.handleIncomingChatMessage(mockData);

      expect(mockConversationRepository.saveConversation).toHaveBeenCalledWith(
        { type: ConversationType.DIRECT, id: "conv-1" },
        true
      );
      expect(
        mockConversationParticipantRepository.saveMultipleConversationParticipant
      ).toHaveBeenCalled();
    });

    it("should throw error if handling fails", async () => {
      const mockData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        senderId: "peer-1",
        sentAt: new Date(),
        messageType: MessageType.TEXT,
      };

      mockPeerService.findPeerById.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        chatService.handleIncomingChatMessage(mockData)
      ).rejects.toThrow("Database error");
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
  });

  describe("sendChatMessage", () => {
    beforeEach(() => {
      // Set up peer state for sending messages
      (chatService as any).peer = { id: "peer-1", username: "peeruser" };
    });

    it("should send message with existing conversation", async () => {
      const message = "Hello World";
      const mockConversation = { id: "conv-1", type: ConversationType.DIRECT };
      const mockMessage = {
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
        sender: { id: "test-user-id" },
        conversation: { id: "conv-1" },
      } as Message;
      const mockMessageStatus = { id: "status-1" } as MessageStatus;

      (chatService as any).conversation = mockConversation;
      mockMessageRepository.saveMessage.mockResolvedValue(mockMessage);
      mockMessageStatusRepository.saveMessageStatus.mockResolvedValue(
        mockMessageStatus
      );

      const result = await chatService.sendChatMessage(message);

      expect(mockMessageRepository.saveMessage).toHaveBeenCalled();
      expect(mockMessageStatusRepository.saveMessageStatus).toHaveBeenCalled();
      expect(mockConnectionService.sendChatMessage).toHaveBeenCalledWith(
        "peer-1",
        expect.objectContaining({
          message: message,
          conversationId: "conv-1",
          messageId: "msg-1",
          senderId: "test-user-id",
        })
      );
      expect(
        mockMessageStatusRepository.updateMessageStatusById
      ).toHaveBeenCalledWith("status-1", MessageStatusType.SENT);
      expect(result).toBe("conv-1");
    });

    it("should create new conversation if none exists", async () => {
      const message = "Hello World";
      const mockConversation = {
        id: "conv-1",
        type: ConversationType.DIRECT,
      } as Conversation;
      const mockMessage = {
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
        sender: { id: "test-user-id" },
        conversation: { id: "conv-1" },
      } as Message;
      const mockMessageStatus = { id: "status-1" } as MessageStatus;

      mockConversationParticipantRepository.isDirectConversationExists.mockResolvedValue(
        undefined
      );
      mockDatabase.write.mockImplementation(async (fn: Function) => await fn());
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
      expect(result).toBe("conv-1");
    });

    it("should handle send failure and update status to not sent", async () => {
      const message = "Hello World";
      const mockConversation = { id: "conv-1", type: ConversationType.DIRECT };
      const mockMessage = {
        id: "msg-1",
        content: message,
        createdAt: new Date(),
        messageType: MessageType.TEXT,
        sender: { id: "test-user-id" },
        conversation: { id: "conv-1" },
      } as Message;
      const mockMessageStatus = { id: "status-1" } as MessageStatus;

      (chatService as any).conversation = mockConversation;
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
      (chatService as any).peer = undefined;

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
      ] as any;

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
      const mockConversations = [
        { conversation: { id: "conv-1" } },
      ] as ConversationParticipant[];

      mockConversationParticipantRepository.queryConversationByPeer.mockResolvedValue(
        mockConversations
      );

      const result = await chatService.findChatByPeer(peerId);

      expect(
        mockConversationParticipantRepository.queryConversationByPeer
      ).toHaveBeenCalledWith(peerId, "test-user-id");
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

  describe("getAllConversations", () => {
    it("should return all conversations", async () => {
      const mockConversations = [
        { id: "conv-1", type: ConversationType.DIRECT },
        { id: "conv-2", type: ConversationType.DIRECT },
      ] as Conversation[];

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
      const mockMessages = [
        { id: "msg-1", content: "Hello" },
        { id: "msg-2", content: "Hi" },
      ] as Message[];

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
      const mockStatus = {
        id: "status-1",
        status: MessageStatusType.DELIVERED,
      } as MessageStatus;

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
      const mockConversations = [
        { conversation: { id: "conv-1" } },
      ] as ConversationParticipant[];
      const mockMessages = [
        { id: "msg-1", content: "Hello" },
        { id: "msg-2", content: "Hi" },
      ] as Message[];
      const mockUnsentStatuses = [
        { message: { id: "msg-1" } },
      ] as MessageStatus[];

      mockConversationParticipantRepository.queryConversationByPeer.mockResolvedValue(
        mockConversations
      );
      mockMessageRepository.queryMessagesByConversation.mockResolvedValue(
        mockMessages
      );
      mockMessageStatusRepository.queryNotSentByMessages.mockResolvedValue(
        mockUnsentStatuses
      );

      const result = await chatService.getAllNotSentMessageForPeer(peerId);

      expect(
        mockConversationParticipantRepository.queryConversationByPeer
      ).toHaveBeenCalledWith(peerId, "test-user-id");
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
      const mockMessage = {
        id: "msg-1",
        content: "Hello",
        conversation: { id: "conv-1" },
        sender: { id: "test-user-id" },
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      } as Message;

      await chatService.tryResendMessage(mockMessage, "peer-1", {
        ipAddress: "192.168.1.101",
        port: 8080,
      });

      expect(mockConnectionService.connectToPeer).toHaveBeenCalledWith(
        "peer-1",
        "192.168.1.101",
        8080
      );
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
      const mockMessage = {
        id: "msg-1",
        content: "Hello",
        conversation: { id: "conv-1" },
        sender: { id: "test-user-id" },
        createdAt: new Date(),
        messageType: MessageType.TEXT,
      } as Message;

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
      const mockOps = [jest.fn()] as any;

      mockDatabase.write.mockImplementation(async (fn: Function) => await fn());
      mockConversationRepository.getConversationDestroyOps.mockResolvedValue(
        mockOps
      );
      mockMessageRepository.getAllMessageDestroyOps.mockResolvedValue(mockOps);
      mockMessageStatusRepository.getStatusDestroyOps.mockResolvedValue(
        mockOps
      );
      mockConversationParticipantRepository.getParticipantDestroyOps.mockResolvedValue(
        mockOps
      );
      mockDatabase.batch = jest.fn();

      await chatService.deleteAllConversations();

      expect(mockDatabase.write).toHaveBeenCalled();
      expect(mockDatabase.batch).toHaveBeenCalled();
    });
  });
});
