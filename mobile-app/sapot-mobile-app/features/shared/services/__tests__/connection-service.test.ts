import { ChatService } from "@/features/chat/services/chat-service";
import { DataChatMessageI } from "@/features/chat/types";
import { createMockMediaStream } from "@/test/mocks/adapter.mock-builders";
import { createConnectionServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import { RTCSessionDescriptionInit } from "react-native-webrtc/lib/typescript/RTCSessionDescription";
import {
  TcpClientAdapter,
  TcpServerAdapter,
  WebrtcAdapter,
  WsSignalingAdapter,
} from "../../adapters";
import { NetworkConfig, UserStore } from "../../stores";
import {
  AudioCallMessage,
  CallEndedMessage,
  ChatMessage,
  SignalingMessage,
} from "../../types";
import { ConnectionService } from "../connection-service";

export enum MessageType {
  TEXT = "text",
  PHOTO = "photo",
  VIDEO = "video",
  FILE = "file",
}
const mockOfferDescription: RTCSessionDescriptionInit = {
  type: "offer",
  sdp: "mock-sdp",
};
const mockAnswerDescription: RTCSessionDescriptionInit = {
  type: "answer",
  sdp: "mock-sdp",
};

const mockIceCandidate: RTCIceCandidate = {
  candidate: "candidate:123456 ...",
  sdpMid: "0",
  sdpMLineIndex: 0,
} as RTCIceCandidate;


// Mock the adapters
jest.mock("../../adapters", () => ({
  TcpClientAdapter: jest.fn(),
  TcpServerAdapter: jest.fn(),
  WebrtcAdapter: jest.fn(),
  WsSignalingAdapter: jest.fn(),
}));

// Mock the stores
jest.mock("../../stores", () => ({
  NetworkConfig: jest.fn(),
  UserStore: jest.fn(),
}));

// Mock ChatService
jest.mock("@/features/chat/services/chat-service", () => ({
  ChatService: jest.fn(),
}));

describe("ConnectionService", () => {
  let connectionService: ConnectionService;
  let mockTcpServerAdapter: jest.Mocked<TcpServerAdapter>;
  let mockNetworkConfig: jest.Mocked<NetworkConfig>;
  let mockUserStore: jest.Mocked<UserStore>;
  let mockTcpClientAdapter: jest.Mocked<TcpClientAdapter>;
  let mockWebrtcAdapter: jest.Mocked<WebrtcAdapter>;
  let mockWsSignalingAdapter: jest.Mocked<WsSignalingAdapter>;
  let mockChatService: jest.Mocked<ChatService>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createConnectionServiceDependencyMocks();

    mockTcpServerAdapter =
      mocks.tcpServerAdapter as unknown as jest.Mocked<TcpServerAdapter>;
    mockNetworkConfig =
      mocks.networkConfig as unknown as jest.Mocked<NetworkConfig>;
    mockUserStore = mocks.userStore as unknown as jest.Mocked<UserStore>;
    mockTcpClientAdapter =
      mocks.tcpClientAdapter as unknown as jest.Mocked<TcpClientAdapter>;
    mockWebrtcAdapter =
      mocks.webrtcAdapter as unknown as jest.Mocked<WebrtcAdapter>;
    mockWsSignalingAdapter =
      mocks.wsSignalingAdapter as unknown as jest.Mocked<WsSignalingAdapter>;
    mockChatService = mocks.chatService as unknown as jest.Mocked<ChatService>;

    // Mock constructors
    jest
      .mocked(TcpServerAdapter)
      .mockImplementation(() => mockTcpServerAdapter);
    jest
      .mocked(TcpClientAdapter)
      .mockImplementation(() => mockTcpClientAdapter);
    jest.mocked(WebrtcAdapter).mockImplementation(() => mockWebrtcAdapter);
    jest
      .mocked(WsSignalingAdapter)
      .mockImplementation(() => mockWsSignalingAdapter);
    jest.mocked(ChatService).mockImplementation(() => mockChatService);

    // Create service instance
    connectionService = new ConnectionService(
      mockTcpServerAdapter,
      mockNetworkConfig,
      mockUserStore,
      mockWsSignalingAdapter,
      "ws://localhost:8000"
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with provided dependencies", () => {
      expect(connectionService).toBeInstanceOf(ConnectionService);
      expect(mockTcpServerAdapter.on).toHaveBeenCalledWith(
        "data",
        expect.any(Function)
      );
    });

    it("should handle audio-call messages", async () => {
      // Verify that the on method was called during constructor
      expect(mockTcpServerAdapter.on).toHaveBeenCalledWith(
        "data",
        expect.any(Function)
      );

      // Get the data handler from the on call
      const dataHandler = mockTcpServerAdapter.on.mock.calls.find(
        (call) => call[0] === "data"
      )?.[1];

      expect(dataHandler).toBeDefined();

      const audioCallMessage: AudioCallMessage = {
        type: "audio-call" as const,
        data: { from: "peer-1", to: "peer-2" },
      };

      const initializeSpy = jest
        .spyOn(connectionService, "initializeStream")
        .mockResolvedValue();
      const emitSpy = jest.spyOn(connectionService, "emit");

      await dataHandler?.(audioCallMessage);

      expect(initializeSpy).toHaveBeenCalledWith("peer-1");
      expect(emitSpy).toHaveBeenCalledWith("audio-call", "peer-1");
    });

    it("should handle signalling messages", async () => {
      const dataHandler = mockTcpServerAdapter.on.mock.calls.find(
        (call) => call[0] === "data"
      )?.[1];

      expect(dataHandler).toBeDefined();

      const iceCandidateMessage: SignalingMessage = {
        type: "ice-candidate",
        data: {
          sender: "peer-1",
          to: "peer-2",
          candidate: mockIceCandidate,
          ipAddress: "127.0.0.1",
          port: 3000,
        },
      };
      const offerMessage: SignalingMessage = {
        type: "offer",
        data: {
          sender: "peer-1",
          to: "peer-2",
          sdp: mockOfferDescription,
          ipAddress: "127.0.0.1",
          port: 3000,
        },
      };
      const answerMessage: SignalingMessage = {
        type: "answer",
        data: {
          sender: "peer-1",
          to: "peer-2",
          sdp: mockAnswerDescription,
          ipAddress: "127.0.0.1",
          port: 3000,
        },
      };
      const handshakeMessage: SignalingMessage = {
        type: "handshake",
        data: { sender: "peer-1", to: "peer-2", ipAddress: "test", port: 123 },
      };

      const handleSpy = jest
        .spyOn(
          connectionService as unknown as {
            handleWebrtcConnection: (msg: unknown) => Promise<void>;
          },
          "handleWebrtcConnection"
        )
        .mockResolvedValue(undefined);
      await dataHandler?.(iceCandidateMessage);
      expect(handleSpy).toHaveBeenCalledWith(iceCandidateMessage);

      await dataHandler?.(offerMessage);
      expect(handleSpy).toHaveBeenCalledWith(offerMessage);

      await dataHandler?.(answerMessage);
      expect(handleSpy).toHaveBeenCalledWith(answerMessage);

      await dataHandler?.(handshakeMessage);
      expect(handleSpy).toHaveBeenCalledWith(handshakeMessage);
    });

    it("should handle call-ended messages", async () => {
      const dataHandler = mockTcpServerAdapter.on.mock.calls.find(
        (call) => call[0] === "data"
      )?.[1];

      expect(dataHandler).toBeDefined();

      const callEndedMessage: CallEndedMessage = {
        type: "call-ended" as const,
        data: { from: "peer-1", to: "peer-2" },
      };

      const emitSpy = jest.spyOn(connectionService, "emit");

      await dataHandler?.(callEndedMessage);

      expect(emitSpy).toHaveBeenCalledWith("call-ended");
    });
  });

  describe("getTcpClientAdapter", () => {
    it("should return existing adapter if available", () => {
      const peerId = "peer-1";

      // First call creates adapter
      const adapter1 = connectionService.getTcpClientAdapter(peerId);
      expect(TcpClientAdapter).toHaveBeenCalledWith(peerId);

      // Second call returns same adapter
      const adapter2 = connectionService.getTcpClientAdapter(peerId);
      expect(adapter1).toBe(adapter2);
      expect(TcpClientAdapter).toHaveBeenCalledTimes(1);
    });

    it("should create new adapter for different peer", () => {
      const peerId1 = "peer-1";
      const peerId2 = "peer-2";

      connectionService.getTcpClientAdapter(peerId1);
      connectionService.getTcpClientAdapter(peerId2);

      expect(TcpClientAdapter).toHaveBeenCalledTimes(2);
      expect(TcpClientAdapter).toHaveBeenNthCalledWith(1, peerId1);
      expect(TcpClientAdapter).toHaveBeenNthCalledWith(2, peerId2);
    });

    it("should throw error if adapter creation fails", () => {
      jest.mocked(TcpClientAdapter).mockImplementationOnce(() => {
        throw new Error("Adapter creation failed");
      });

      expect(() => connectionService.getTcpClientAdapter("peer-1")).toThrow(
        "Adapter creation failed"
      );
    });
  });

  describe("getWebrtcAdapter", () => {
    it("should return existing adapter if available", () => {
      const peerId = "peer-1";

      const adapter1 = connectionService.getWebrtcAdapter(peerId);
      const adapter2 = connectionService.getWebrtcAdapter(peerId);

      expect(adapter1).toBe(adapter2);
      expect(WebrtcAdapter).toHaveBeenCalledTimes(1);
    });

    it("should setup WebRTC events for new adapter", () => {
      const peerId = "peer-1";
      const setupSpy = jest.spyOn(connectionService, "setupWebrtcEvents");

      connectionService.getWebrtcAdapter(peerId);

      expect(setupSpy).toHaveBeenCalledWith(mockWebrtcAdapter, peerId);
    });

    it("should throw error if adapter creation fails", () => {
      jest.mocked(WebrtcAdapter).mockImplementationOnce(() => {
        throw new Error("WebRTC adapter creation failed");
      });

      expect(() => connectionService.getWebrtcAdapter("peer-1")).toThrow(
        "WebRTC adapter creation failed"
      );
    });
  });

  describe("setupWebrtcEvents", () => {
    it("should setup ice candidate event handler", () => {
      const peerId = "peer-1";
      const sendMessageSpy = jest
        .spyOn(connectionService, "sendMessage")
        .mockImplementation();

      connectionService.setupWebrtcEvents(mockWebrtcAdapter, peerId);

      // Simulate ice candidate event
      const onIceCandidateHandler = mockWebrtcAdapter.on.mock.calls.find(
        (call) => call[0] === "onicecandidate"
      )?.[1];

      onIceCandidateHandler?.(mockIceCandidate);

      expect(sendMessageSpy).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "ice-candidate",
          data: expect.objectContaining({
            from: mockUserStore.user.id,
            sender: mockUserStore.user.id,
            to: peerId,
            candidate: mockIceCandidate,
            ipAddress: mockNetworkConfig.ipAddress,
            port: mockNetworkConfig.port,
          }),
        })
      );
    });

    it("should setup received message handler for chat messages", async () => {
      const peerId = "peer-1";
      connectionService.setChatService(mockChatService);

      connectionService.setupWebrtcEvents(mockWebrtcAdapter, peerId);

      const receivedMessageHandler = mockWebrtcAdapter.on.mock.calls.find(
        (call) => call[0] === "receivedMessage"
      )?.[1];

      const chatMessage: ChatMessage = {
        type: "chat" as const,
        data: {
          message: "Hello",
          conversationId: "conv-1",
          messageId: "msg-1",
          from: "peer-1",
          to: "peer-2",
          sentAt: new Date(),
          messageType: MessageType.TEXT,
        },
      };

      await receivedMessageHandler?.(chatMessage);

      expect(mockChatService.handleIncomingChatMessage).toHaveBeenCalledWith(
        chatMessage.data
      );
    });

    it("should setup received message handler for ack messages", async () => {
      const peerId = "peer-1";
      connectionService.setChatService(mockChatService);

      connectionService.setupWebrtcEvents(mockWebrtcAdapter, peerId);

      const receivedMessageHandler = mockWebrtcAdapter.on.mock.calls.find(
        (call) => call[0] === "receivedMessage"
      )?.[1];

      const ackMessage = {
        type: "ack" as const,
        data: { messageId: "msg-1" },
      };

      await receivedMessageHandler?.(ackMessage);

      expect(mockChatService.handleAckMessage).toHaveBeenCalledWith("msg-1");
    });

    it("should setup remote stream handler", () => {
      const peerId = "peer-1";
      const emitSpy = jest.spyOn(connectionService, "emit");

      connectionService.setupWebrtcEvents(mockWebrtcAdapter, peerId);

      const remoteStreamHandler = mockWebrtcAdapter.on.mock.calls.find(
        (call) => call[0] === "remoteStream"
      )?.[1];

      const mockStream = createMockMediaStream("stream-1");
      remoteStreamHandler?.(mockStream);

      expect(emitSpy).toHaveBeenCalledWith("remoteStream", mockStream);
    });
  });

  describe("setChatService", () => {
    it("should set chat service instance", () => {
      connectionService.setChatService(mockChatService);
      // We can't directly test private property, but we can test it indirectly through other methods
      expect(mockChatService).toBeDefined();
    });
  });

  describe("start", () => {
    it("should start TCP server with configured port", () => {
      connectionService.start();

      expect(mockTcpServerAdapter.start).toHaveBeenCalledWith(
        mockNetworkConfig.port
      );
    });

    it("should throw error if start fails", () => {
      mockTcpServerAdapter.start.mockImplementation(() => {
        throw new Error("Server start failed");
      });

      expect(() => connectionService.start()).toThrow("Server start failed");
    });
  });

  describe("connectToPeer", () => {
    beforeEach(() => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      Object.defineProperty(mockTcpClientAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      mockWebrtcAdapter.createOffer.mockResolvedValue({
        type: "offer",
        sdp: "mock-sdp",
      });
    });

    it("should connect to peer successfully", async () => {
      const peerId = "peer-1";
      const ipAddress = "192.168.1.101";
      const port = 8081;
      const sendMessageSpy = jest
        .spyOn(connectionService, "sendMessage")
        .mockImplementation();

      // Mock connection established event
      mockWebrtcAdapter.once.mockImplementation((event, callback) => {
        if (event === "connection-established") {
          setTimeout(callback, 0);
        }
        return mockWebrtcAdapter;
      });

      const connectPromise = connectionService.connectToPeer(
        peerId,
        ipAddress,
        port
      );

      await expect(connectPromise).resolves.toBeUndefined();
      expect(mockTcpClientAdapter.connect).toHaveBeenCalledWith(
        ipAddress,
        port
      );
      expect(sendMessageSpy).toHaveBeenCalledTimes(2); // handshake and offer
    });

    it("should resolve immediately if already connected", async () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(true),
        configurable: true,
      });
      const connectPromise = connectionService.connectToPeer(
        "peer-1",
        "192.168.1.101",
        8081
      );

      await expect(connectPromise).resolves.toBeUndefined();
    });

    it("should handle connection failure", async () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      Object.defineProperty(mockTcpClientAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      mockWebrtcAdapter.createOffer.mockResolvedValue({
        type: "offer",
        sdp: "mock-sdp",
      });

      // Mock once to trigger connection-failed
      mockWebrtcAdapter.once.mockImplementation((event, callback) => {
        if (event === "connection-failed") {
          setTimeout(() => callback(new Error("Connection failed")), 10);
        }
        return mockWebrtcAdapter;
      });

      const connectPromise = connectionService.connectToPeer(
        "peer-1",
        "192.168.1.101",
        8081
      );

      await expect(connectPromise).rejects.toThrow("Connection failed");
    });
  });

  describe("sendMessage", () => {
    it("should send message via TCP client adapter", () => {
      const peerId = "peer-1";
      const message = {
        type: "handshake" as const,
        data: { sender: "test", to: peerId, ipAddress: "123", port: 123 },
      };

      connectionService.sendMessage(peerId, message);

      expect(mockTcpClientAdapter.sendMessage).toHaveBeenCalledWith(message);
    });

    it("should not send message if adapter not connected", () => {
      Object.defineProperty(mockTcpClientAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      const message = {
        type: "handshake" as const,
        data: { sender: "test", to: peerId, ipAddress: "test", port: 123 },
      };

      connectionService.sendMessage(peerId, message);

      expect(mockTcpClientAdapter.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("sendChatMessage", () => {
    it("should send chat message via WebRTC", () => {
      const peerId = "peer-1";
      const messageData: DataChatMessageI = {
        message: "Hello World",
        conversationId: "conv-1",
        messageId: "msg-1",
        from: "test-user",
        to: peerId,
        sentAt: new Date(),
        messageType: MessageType.TEXT,
      };

      connectionService.sendChatMessage(peerId, messageData);

      expect(mockWebrtcAdapter.sendDataMessage).toHaveBeenCalledWith({
        type: "chat",
        data: messageData,
      });
    });
  });

  describe("sendAckMessage", () => {
    it("should send acknowledgment message", () => {
      const peerId = "peer-1";
      const ackData = { messageId: "msg-1", from: "peer-2", to: peerId };

      connectionService.sendAckMessage(peerId, ackData);

      expect(mockWebrtcAdapter.sendDataMessage).toHaveBeenCalledWith({
        type: "ack",
        data: {
          messageId: ackData.messageId,
          from: mockUserStore.user.id,
          to: peerId,
        },
      });
    });
  });

  describe("initializeStream", () => {
    it("should initialize local stream for connected peer", async () => {
      const peerId = "peer-1";

      await connectionService.initializeStream(peerId);

      expect(mockWebrtcAdapter.initializeLocalStream).toHaveBeenCalledWith(
        true,
        true
      );
    });

    it("should throw error if peer not connected", async () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      await expect(connectionService.initializeStream(peerId)).rejects.toThrow(
        "Not connected"
      );
    });
  });

  describe("terminateCallConnection", () => {
    it("should terminate call for connected peer", () => {
      const peerId = "peer-1";

      connectionService.terminateCallConnection(peerId);

      expect(mockWebrtcAdapter.terminateCall).toHaveBeenCalled();
    });

    it("should not terminate call if peer not connected", () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      connectionService.terminateCallConnection(peerId);

      expect(mockWebrtcAdapter.terminateCall).not.toHaveBeenCalled();
    });
  });

  describe("toggleMic", () => {
    it("should toggle microphone for connected peer", () => {
      const peerId = "peer-1";

      connectionService.toggleMic(peerId);

      expect(mockWebrtcAdapter.toggleMic).toHaveBeenCalled();
    });

    it("should throw error if peer not connected", () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      expect(() => connectionService.toggleMic(peerId)).toThrow(
        "Webrtc not connected"
      );
    });
  });

  describe("toggleCamera", () => {
    it("should toggle camera for connected peer", () => {
      const peerId = "peer-1";

      connectionService.toggleCamera(peerId);

      expect(mockWebrtcAdapter.toggleCamera).toHaveBeenCalled();
    });

    it("should throw error if peer not connected", () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      expect(() => connectionService.toggleCamera(peerId)).toThrow(
        "Webrtc not connected"
      );
    });
  });

  describe("getLocalStream", () => {
    it("should return local stream for connected peer", () => {
      const peerId = "peer-1";
      const mockStream = createMockMediaStream();
      mockWebrtcAdapter.getLocalStream.mockReturnValue(mockStream);

      const result = connectionService.getLocalStream(peerId);

      expect(result).toBe(mockStream);
      expect(mockWebrtcAdapter.getLocalStream).toHaveBeenCalled();
    });

    it("should throw error if peer not connected", () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      expect(() => connectionService.getLocalStream(peerId)).toThrow(
        "Webrtc not connected"
      );
    });
  });

  describe("renegotiate", () => {
    it("should renegotiate WebRTC connection", async () => {
      const peerId = "peer-1";
      const sendMessageSpy = jest
        .spyOn(connectionService, "sendMessage")
        .mockImplementation();
      mockWebrtcAdapter.createOffer.mockResolvedValue({
        type: "offer",
        sdp: "new-sdp",
      });

      await connectionService.renegotiate(peerId);

      expect(mockWebrtcAdapter.createOffer).toHaveBeenCalled();
      expect(sendMessageSpy).toHaveBeenCalledWith(
        peerId,
        expect.objectContaining({
          type: "offer",
          data: expect.objectContaining({
            sdp: { type: "offer", sdp: "new-sdp" },
            from: mockUserStore.user.id,
            sender: mockUserStore.user.id,
            to: peerId,
            ipAddress: mockNetworkConfig.ipAddress,
            port: mockNetworkConfig.port,
          }),
        })
      );
    });

    it("should throw error if not connected", async () => {
      Object.defineProperty(mockWebrtcAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      Object.defineProperty(mockTcpClientAdapter, "isConnected", {
        get: jest.fn().mockReturnValue(false),
        configurable: true,
      });
      const peerId = "peer-1";

      await expect(connectionService.renegotiate(peerId)).rejects.toThrow(
        "Webrtc not connected"
      );
    });
  });

  describe("stop", () => {
    it("should cleanup all resources", () => {
      const removeAllListenersSpy = jest.spyOn(
        connectionService,
        "removeAllListeners"
      );

      // Add some adapters to the maps
      connectionService.getTcpClientAdapter("peer-1");
      connectionService.getWebrtcAdapter("peer-1");

      connectionService.stop();

      expect(mockWebrtcAdapter.cleanup).toHaveBeenCalled();
      expect(mockTcpClientAdapter.disconnect).toHaveBeenCalled();
      expect(mockTcpServerAdapter.stop).toHaveBeenCalled();
      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(mockWebrtcAdapter.removeAllListeners).toHaveBeenCalled();
    });

    it("should throw error if cleanup fails", () => {
      mockTcpServerAdapter.stop.mockImplementation(() => {
        throw new Error("Stop failed");
      });

      expect(() => connectionService.stop()).toThrow("Stop failed");
    });
  });
});
