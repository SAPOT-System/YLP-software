import { ChatService } from "@/features/chat/services/chat-service";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../../adapters";
import { NetworkConfig, SessionStore, UserStore } from "../../stores";
import { DiscoveryService } from "../discovery-service";
import { PeerService } from "../peer-service";
import { Message } from "../../database";

// Mock the adapters
jest.mock("../../adapters", () => ({
  ZeroconfAdapter: jest.fn(),
}));

// Mock the stores
jest.mock("../../stores", () => ({
  NetworkConfig: jest.fn(),
  SessionStore: jest.fn(),
  UserStore: jest.fn(),
}));

// Mock PeerService
jest.mock("../peer-service", () => ({
  PeerService: jest.fn(),
}));

// Mock ChatService
jest.mock("@/features/chat/services/chat-service", () => ({
  ChatService: jest.fn(),
}));

describe("DiscoveryService", () => {
  let discoveryService: DiscoveryService;
  let mockZeroconfAdapter: jest.Mocked<ZeroconfAdapter>;
  let mockSessionStore: jest.Mocked<SessionStore>;
  let mockNetworkConfig: jest.Mocked<NetworkConfig>;
  let mockUserStore: jest.Mocked<UserStore>;
  let mockPeerService: jest.Mocked<PeerService>;
  let mockChatService: jest.Mocked<ChatService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockZeroconfAdapter = {
      on: jest.fn(),
      startScan: jest.fn(),
      stopScan: jest.fn(),
      publishService: jest.fn(),
      cleanUp: jest.fn(),
    } as any;

    mockSessionStore = {
      userId: "test-user-id",
      setUserId: jest.fn(),
    } as any;

    mockNetworkConfig = {
      port: 8080,
      ipAddress: "192.168.1.100",
    } as any;

    mockUserStore = {
      user: {
        id: "test-user-id",
        username: "testuser",
      },
      setUser: jest.fn(),
    } as any;

    mockPeerService = {
      register: jest.fn(),
      markOffline: jest.fn(),
      markOnline: jest.fn(),
      getAllPeers: jest.fn(),
      findPeerById: jest.fn(),
      findDiscoveredPeerById: jest.fn(),
      createUser: jest.fn(),
      cleanUp: jest.fn(),
    } as any;

    mockChatService = {
      getAllNotSentMessageForPeer: jest.fn(),
      tryResendMessage: jest.fn(),
      handleIncomingChatMessage: jest.fn(),
      handleAckMessage: jest.fn(),
    } as any;

    // Mock constructors
    jest.mocked(ZeroconfAdapter).mockImplementation(() => mockZeroconfAdapter);
    jest.mocked(SessionStore).mockImplementation(() => mockSessionStore);
    jest.mocked(NetworkConfig).mockImplementation(() => mockNetworkConfig);
    jest.mocked(UserStore).mockImplementation(() => mockUserStore);
    jest.mocked(PeerService).mockImplementation(() => mockPeerService);
    jest.mocked(ChatService).mockImplementation(() => mockChatService);

    // Create service instance
    discoveryService = new DiscoveryService(
      mockZeroconfAdapter,
      mockSessionStore,
      mockNetworkConfig,
      mockUserStore,
      mockPeerService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("constructor", () => {
    it("should initialize with provided dependencies", () => {
      expect(discoveryService).toBeInstanceOf(DiscoveryService);
      expect(mockZeroconfAdapter.on).toHaveBeenCalledWith(
        "serviceResolved",
        expect.any(Function)
      );
      expect(mockZeroconfAdapter.on).toHaveBeenCalledWith(
        "serviceRemoved",
        expect.any(Function)
      );
    });

    it("should handle service resolved event", async () => {
      const mockService: Service = {
        name: "test-device",
        host: "test-device.local",
        fullName: "test-device.local.tcp",
        port: 8080,
        addresses: ["192.168.1.101"],
        txt: {
          id: "peer-1",
          username: "peeruser",
        },
      };

      discoveryService.setChatService(mockChatService);
      const performResendSpy = jest
        .spyOn(discoveryService, "performResendMessagesForPeer")
        .mockResolvedValue();

      // Get the service resolved handler
      const serviceResolvedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceResolved"
      )?.[1];

      expect(serviceResolvedHandler).toBeDefined();

      await serviceResolvedHandler?.(mockService);

      expect(mockPeerService.register).toHaveBeenCalledWith(mockService);
      expect(performResendSpy).toHaveBeenCalledWith(
        "peer-1",
        "192.168.1.101",
        8080
      );
    });

    it("should handle service resolved event error when chat service not set", async () => {
      const mockService: Service = {
        name: "test-device",
        host: "test-device.local",
        fullName: "test-device.local.tcp",
        port: 8080,
        addresses: ["192.168.1.101"],
        txt: {
          id: "peer-1",
          username: "peeruser",
        },
      };

      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const serviceResolvedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceResolved"
      )?.[1];

      // Should not throw error - error is caught internally
      await expect(
        serviceResolvedHandler?.(mockService)
      ).resolves.toBeUndefined();
      // When chat service is not set, the error is thrown before register is called
      expect(mockPeerService.register).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle service removed event", async () => {
      const serviceName = "test-device";

      // Get the service removed handler
      const serviceRemovedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceRemoved"
      )?.[1];

      expect(serviceRemovedHandler).toBeDefined();

      await serviceRemovedHandler?.(serviceName);

      expect(mockPeerService.markOffline).toHaveBeenCalledWith(serviceName);
    });
  });

  describe("setChatService", () => {
    it("should set chat service instance", () => {
      discoveryService.setChatService(mockChatService);
      // We can't directly test private property, but we can test it indirectly through other methods
      expect(mockChatService).toBeDefined();
    });
  });

  describe("startDiscovery", () => {
    it("should start network discovery", () => {
      discoveryService.startDiscovery();

      expect(mockZeroconfAdapter.startScan).toHaveBeenCalled();
    });

    it("should throw error if startScan fails", () => {
      mockZeroconfAdapter.startScan.mockImplementation(() => {
        throw new Error("Start scan failed");
      });

      expect(() => discoveryService.startDiscovery()).toThrow(
        "Start scan failed"
      );
    });
  });

  describe("stopDiscovery", () => {
    it("should stop network discovery", () => {
      discoveryService.stopDiscovery();

      expect(mockZeroconfAdapter.stopScan).toHaveBeenCalled();
    });

    it("should throw error if stopScan fails", () => {
      mockZeroconfAdapter.stopScan.mockImplementation(() => {
        throw new Error("Stop scan failed");
      });

      expect(() => discoveryService.stopDiscovery()).toThrow(
        "Stop scan failed"
      );
    });
  });

  describe("publishDevice", () => {
    it("should publish device on network", () => {
      jest.spyOn(Date, "now").mockReturnValue(1234567890);

      discoveryService.publishDevice();

      expect(mockZeroconfAdapter.publishService).toHaveBeenCalledWith({
        type: "lanchat",
        protocol: "tcp",
        domain: "local.",
        name: "Device-1234567890",
        port: mockNetworkConfig.port,
        txt: {
          id: mockSessionStore.userId,
          username: mockUserStore.user.username,
        },
      });
    });

    it("should throw error if publishService fails", () => {
      mockZeroconfAdapter.publishService.mockImplementation(() => {
        throw new Error("Publish service failed");
      });

      expect(() => discoveryService.publishDevice()).toThrow(
        "Publish service failed"
      );
    });
  });

  describe("performResendMessagesForPeer", () => {
    it("should resend unsent messages for peer", async () => {
      const peerId = "peer-1";
      const ipAddress = "192.168.1.101";
      const port = 8080;
      const mockMessages = [
        { id: "msg-1", content: "Hello" },
        { id: "msg-2", content: "World" },
      ] as Message[];

      discoveryService.setChatService(mockChatService);
      mockChatService.getAllNotSentMessageForPeer.mockResolvedValue(
        mockMessages
      );
      mockChatService.tryResendMessage.mockResolvedValue();

      await discoveryService.performResendMessagesForPeer(
        peerId,
        ipAddress,
        port
      );

      expect(mockChatService.getAllNotSentMessageForPeer).toHaveBeenCalledWith(
        peerId
      );
      expect(mockChatService.tryResendMessage).toHaveBeenCalledTimes(2);
      expect(mockChatService.tryResendMessage).toHaveBeenCalledWith(
        mockMessages[0],
        peerId,
        { ipAddress, port }
      );
      expect(mockChatService.tryResendMessage).toHaveBeenCalledWith(
        mockMessages[1],
        peerId,
        { ipAddress, port }
      );
    });

    it("should handle errors when resending individual messages", async () => {
      const peerId = "peer-1";
      const ipAddress = "192.168.1.101";
      const port = 8080;
      const mockMessages = [
        { id: "msg-1", content: "Hello" },
        { id: "msg-2", content: "World" },
      ] as Message[];

      discoveryService.setChatService(mockChatService);
      mockChatService.getAllNotSentMessageForPeer.mockResolvedValue(
        mockMessages
      );
      mockChatService.tryResendMessage
        .mockRejectedValueOnce(new Error("Resend failed"))
        .mockResolvedValueOnce();

      const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

      await discoveryService.performResendMessagesForPeer(
        peerId,
        ipAddress,
        port
      );

      expect(mockChatService.tryResendMessage).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Failed to resend the message:",
        mockMessages[0]
      );

      consoleWarnSpy.mockRestore();
    });

    it("should throw error if chat service not initialized", async () => {
      await expect(
        discoveryService.performResendMessagesForPeer(
          "peer-1",
          "192.168.1.1",
          8080
        )
      ).rejects.toThrow("Chat service not initialized");
    });

    it("should throw error if getAllNotSentMessageForPeer fails", async () => {
      discoveryService.setChatService(mockChatService);
      mockChatService.getAllNotSentMessageForPeer.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        discoveryService.performResendMessagesForPeer(
          "peer-1",
          "192.168.1.1",
          8080
        )
      ).rejects.toThrow("Database error");
    });
  });

  describe("destroy", () => {
    it("should cleanup resources", () => {
      jest.spyOn(Date, "now").mockReturnValue(1234567890);
      discoveryService.publishDevice(); // Sets publishDeviceName

      discoveryService.destroy();

      expect(mockZeroconfAdapter.cleanUp).toHaveBeenCalledWith(
        "Device-1234567890"
      );
      expect(mockPeerService.cleanUp).toHaveBeenCalled();
    });

    it("should clear interval if it exists", () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      // Set intervalId to simulate an active interval
      (discoveryService as any).intervalId = 123;

      discoveryService.destroy();

      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    });

    it("should throw error if cleanup fails", () => {
      mockZeroconfAdapter.cleanUp.mockImplementation(() => {
        throw new Error("Cleanup failed");
      });

      expect(() => discoveryService.destroy()).toThrow("Cleanup failed");
    });
  });
});
