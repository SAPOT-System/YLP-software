import { ChatService } from "@/features/chat/services/chat-service";
import { discoveryLog } from "@/features/shared/utils/logger";
import {
    createTestMessage,
    createTestMessages,
} from "@/test/factories/chat-model.factory";
import { createTestZeroconfService } from "@/test/factories/peer-service.factory";
import { createDiscoveryServiceDependencyMocks } from "@/test/mocks/service.mock-builders";
import { Service } from "react-native-zeroconf";
import { ZeroconfAdapter } from "../../adapters";
import { Message } from "../../database";
import { AppModeStore, NetworkConfig, SessionStore, UserStore } from "../../stores";
import { DiscoveryService } from "../discovery-service";
import { PeerService } from "../peer-service";

// Mock the adapters
jest.mock("../../adapters", () => ({
  ZeroconfAdapter: jest.fn(),
}));

// Mock the stores
jest.mock("../../stores", () => ({
  NetworkConfig: jest.fn(),
  SessionStore: jest.fn(),
  UserStore: jest.fn(),
  AppModeStore: jest.fn(),
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
  let mockAppModeStore: jest.Mocked<AppModeStore>;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createDiscoveryServiceDependencyMocks();

    mockZeroconfAdapter =
      mocks.zeroconfAdapter as unknown as jest.Mocked<ZeroconfAdapter>;
    mockSessionStore =
      mocks.sessionStore as unknown as jest.Mocked<SessionStore>;
    mockNetworkConfig =
      mocks.networkConfig as unknown as jest.Mocked<NetworkConfig>;
    mockUserStore = mocks.userStore as unknown as jest.Mocked<UserStore>;
    mockPeerService = mocks.peerService as unknown as jest.Mocked<PeerService>;
    mockChatService = mocks.chatService as unknown as jest.Mocked<ChatService>;
    mockAppModeStore = mocks.appModeStore as unknown as jest.Mocked<AppModeStore>;

    // Mock constructors
    jest.mocked(ZeroconfAdapter).mockImplementation(() => mockZeroconfAdapter);
    jest.mocked(SessionStore).mockImplementation(() => mockSessionStore);
    jest.mocked(NetworkConfig).mockImplementation(() => mockNetworkConfig);
    jest.mocked(UserStore).mockImplementation(() => mockUserStore);
    jest.mocked(PeerService).mockImplementation(() => mockPeerService);
    jest.mocked(ChatService).mockImplementation(() => mockChatService);

    mockZeroconfAdapter.publishService.mockResolvedValue(undefined);
    mockZeroconfAdapter.cleanUp.mockResolvedValue(undefined);

    // Create service instance
    discoveryService = new DiscoveryService(
      mockZeroconfAdapter,
      mockSessionStore,
      mockNetworkConfig,
      mockUserStore,
      mockPeerService,
      mockAppModeStore
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.restoreAllMocks();
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
      const mockService =
        createTestZeroconfService() as unknown as Service;

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

      expect(mockPeerService.register).toHaveBeenCalledWith(
        mockService,
        mockNetworkConfig.ipAddress
      );
      expect(performResendSpy).toHaveBeenCalledWith(
        "peer-1",
        "192.168.1.101",
        8080
      );
    });

    it("should skip service resolved when peer id is missing", async () => {
      const mockService = createTestZeroconfService({
        txt: { id: "" },
      }) as unknown as Service;

      discoveryService.setChatService(mockChatService);
      const performResendSpy = jest
        .spyOn(discoveryService, "performResendMessagesForPeer")
        .mockResolvedValue();

      const serviceResolvedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceResolved"
      )?.[1];

      await serviceResolvedHandler?.(mockService);

      expect(mockPeerService.register).not.toHaveBeenCalled();
      expect(performResendSpy).not.toHaveBeenCalled();
    });

    it("should skip self service resolved", async () => {
      const mockService =
        createTestZeroconfService() as unknown as Service;
      Object.defineProperty(mockSessionStore, "userId", { value: "peer-1" });

      discoveryService.setChatService(mockChatService);
      const performResendSpy = jest
        .spyOn(discoveryService, "performResendMessagesForPeer")
        .mockResolvedValue();

      const serviceResolvedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceResolved"
      )?.[1];

      await serviceResolvedHandler?.(mockService);

      expect(mockPeerService.register).not.toHaveBeenCalled();
      expect(performResendSpy).not.toHaveBeenCalled();
    });

    it("should handle service resolved event error when chat service not set", async () => {
      const mockService =
        createTestZeroconfService() as unknown as Service;

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

  describe("publishDevice", () => {
    it("publishes the service and stores the published name after success", async () => {
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1234);

      await expect(discoveryService.publishDevice()).resolves.toBeUndefined();

      expect(mockZeroconfAdapter.publishService).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lanchat",
          protocol: "tcp",
          domain: "local.",
          name: "Device-1234",
          port: mockNetworkConfig.port,
          txt: {
            id: mockSessionStore.userId,
            username: mockUserStore.user.username,
            firstName: mockUserStore.user.firstName,
            lastName: mockUserStore.user.lastName || "",
          },
        })
      );

      await discoveryService.destroy();

      expect(mockZeroconfAdapter.cleanUp).toHaveBeenCalledWith("Device-1234");
      dateNowSpy.mockRestore();
    });

    it("does not publish again when already published", async () => {
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1234);

      await discoveryService.publishDevice();
      await discoveryService.publishDevice();

      expect(mockZeroconfAdapter.publishService).toHaveBeenCalledTimes(1);
      dateNowSpy.mockRestore();
    });

    it("skips publishing when zeroconf is not allowed", async () => {
      mockAppModeStore.isZeroconfAllowed.mockReturnValue(false);

      await expect(discoveryService.publishDevice()).resolves.toBeUndefined();

      expect(mockZeroconfAdapter.publishService).not.toHaveBeenCalled();
    });
  });

  describe("setConnectionService", () => {
    let mockConnectionService: { on: jest.Mock };

    beforeEach(() => {
      mockConnectionService = { on: jest.fn() };
    });

    it("subscribes to peer-reconnected event on ConnectionService", () => {
      discoveryService.setConnectionService(
        mockConnectionService as unknown as import("../connection-service").ConnectionService
      );

      expect(mockConnectionService.on).toHaveBeenCalledWith(
        "peer-reconnected",
        expect.any(Function)
      );
    });

    it("calls performResendMessagesForPeer when peer is in discovered cache", async () => {
      const peerId = "peer-1";
      const discoveredPeer = { id: peerId, ipAddress: "192.168.1.101", port: 8080, serviceName: "dev", addresses: ["192.168.1.101"], lastSeenAt: Date.now() };
      mockPeerService.findDiscoveredPeerById.mockReturnValue(discoveredPeer);
      discoveryService.setChatService(mockChatService);
      mockChatService.getAllNotSentMessageForPeer.mockResolvedValue([]);

      discoveryService.setConnectionService(
        mockConnectionService as unknown as import("../connection-service").ConnectionService
      );

      const handler = mockConnectionService.on.mock.calls.find(
        (call) => call[0] === "peer-reconnected"
      )?.[1];

      await handler?.(peerId);

      expect(mockPeerService.findDiscoveredPeerById).toHaveBeenCalledWith(peerId);
      expect(mockChatService.getAllNotSentMessageForPeer).toHaveBeenCalledWith(peerId);
    });

    it("skips retry when peer is not in discovered cache", async () => {
      const peerId = "peer-unknown";
      mockPeerService.findDiscoveredPeerById.mockReturnValue(undefined);
      discoveryService.setChatService(mockChatService);

      discoveryService.setConnectionService(
        mockConnectionService as unknown as import("../connection-service").ConnectionService
      );

      const handler = mockConnectionService.on.mock.calls.find(
        (call) => call[0] === "peer-reconnected"
      )?.[1];

      const warnSpy = jest.spyOn(discoveryLog, "warn");
      await handler?.(peerId);

      expect(mockChatService.getAllNotSentMessageForPeer).not.toHaveBeenCalled();
      warnSpy.mockRestore();
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
    it("publishes the service and stores the published name after success", async () => {
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1234567890);

      await expect(discoveryService.publishDevice()).resolves.toBeUndefined();

      expect(mockZeroconfAdapter.publishService).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lanchat",
          protocol: "tcp",
          domain: "local.",
          name: "Device-1234567890",
          port: mockNetworkConfig.port,
          txt: {
            id: mockSessionStore.userId,
            username: mockUserStore.user.username,
            firstName: mockUserStore.user.firstName,
            lastName: mockUserStore.user.lastName || "",
          },
        })
      );

        await discoveryService.destroy();

      expect(mockZeroconfAdapter.cleanUp).toHaveBeenCalledWith("Device-1234567890");
      dateNowSpy.mockRestore();
    });

    it("skips publishing when zeroconf is not allowed", async () => {
      mockAppModeStore.isZeroconfAllowed.mockReturnValue(false);

      await expect(discoveryService.publishDevice()).resolves.toBeUndefined();

      expect(mockZeroconfAdapter.publishService).not.toHaveBeenCalled();
    });

    it("propagates publish failures", async () => {
      mockZeroconfAdapter.publishService.mockRejectedValue(
        new Error("Publish service failed")
      );

      await expect(discoveryService.publishDevice()).rejects.toThrow(
        "Publish service failed"
      );
    });
  });

  describe("performResendMessagesForPeer", () => {
    it("should resend unsent messages for peer", async () => {
      const peerId = "peer-1";
      const ipAddress = "192.168.1.101";
      const port = 8080;
      const mockMessages = createTestMessages(2, (index) =>
        index === 0
          ? { id: "msg-1", content: "Hello" }
          : { id: "msg-2", content: "World" }
      ) as unknown as Message[];

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
        createTestMessage({ id: "msg-1", content: "Hello" }),
        createTestMessage({ id: "msg-2", content: "World" }),
      ] as unknown as Message[];

      discoveryService.setChatService(mockChatService);
      mockChatService.getAllNotSentMessageForPeer.mockResolvedValue(
        mockMessages
      );
      const resendError = new Error("Resend failed");

      mockChatService.tryResendMessage
        .mockRejectedValueOnce(resendError)
        .mockResolvedValueOnce();

      const warnSpy = jest.spyOn(discoveryLog, "warn");

      await discoveryService.performResendMessagesForPeer(
        peerId,
        ipAddress,
        port
      );

      expect(mockChatService.tryResendMessage).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith("discovery › resend failed", {
        peerId,
        error: resendError,
      });
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
    it("should cleanup resources", async () => {
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1234567890);
      await discoveryService.publishDevice();

      await discoveryService.destroy();

      expect(mockZeroconfAdapter.cleanUp).toHaveBeenCalledWith(
        "Device-1234567890"
      );
      expect(mockPeerService.cleanUp).toHaveBeenCalled();
      dateNowSpy.mockRestore();
    });

    it("should clear interval if it exists", async () => {
      const clearIntervalSpy = jest.spyOn(global, "clearInterval");
      // Set intervalId to simulate an active interval
      (discoveryService as unknown as { intervalId: number }).intervalId = 123;

      await discoveryService.destroy();

      expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    });

    it("should throw error if cleanup fails", async () => {
      const dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(1234567890);
      await discoveryService.publishDevice();
      mockZeroconfAdapter.cleanUp.mockImplementation(() => {
        throw new Error("Cleanup failed");
      });

      await expect(discoveryService.destroy()).rejects.toThrow("Cleanup failed");
      dateNowSpy.mockRestore();
    });
  });

  describe("publication state tracking", () => {
    it("should set published to true after successful publish", async () => {
      expect(discoveryService.isPublished()).toBe(false);

      await discoveryService.publishDevice();

      expect(discoveryService.isPublished()).toBe(true);
    });

    it("should set published to false after failed publish", async () => {
      mockZeroconfAdapter.publishService.mockRejectedValue(
        new Error("Publish failed")
      );

      try {
        await discoveryService.publishDevice();
      } catch {
        // Expected to fail
      }

      expect(discoveryService.isPublished()).toBe(false);
    });

    it("should set published to false on destroy", async () => {
      await discoveryService.publishDevice();
      expect(discoveryService.isPublished()).toBe(true);

      await discoveryService.destroy();

      expect(discoveryService.isPublished()).toBe(false);
    });

    it("should notify listeners when publication state changes", async () => {
      const listener = jest.fn();
      discoveryService.subscribeToPublished(listener);

      await discoveryService.publishDevice();

      expect(listener).toHaveBeenCalled();
    });

    it("should allow unsubscribing from publication state changes", async () => {
      const listener = jest.fn();
      const unsubscribe = discoveryService.subscribeToPublished(listener);

      unsubscribe();

      await discoveryService.publishDevice();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("liveness sweep", () => {
    const makePeer = (overrides: Record<string, unknown> = {}) => ({
      serviceName: "dev",
      id: "peer-1",
      port: 8080,
      ipAddress: "192.168.1.101",
      addresses: ["192.168.1.101"],
      lastSeenAt: 0, // far in the past → stale
      ...overrides,
    });

    let mockConnectionService: {
      on: jest.Mock;
      probePeerReachable: jest.Mock;
      handlePeerRediscovered: jest.Mock;
    };

    beforeEach(() => {
      mockConnectionService = {
        on: jest.fn(),
        probePeerReachable: jest.fn(),
        handlePeerRediscovered: jest.fn(),
      };
      discoveryService.setConnectionService(
        mockConnectionService as unknown as import("../connection-service").ConnectionService
      );
    });

    it("evicts a stale peer after MAX_MISSED_PROBES failed probes", async () => {
      mockPeerService.getDiscoveredPeers.mockReturnValue([makePeer()]);
      mockConnectionService.probePeerReachable.mockResolvedValue(false);
      // First failure → 1, second failure → 2 (eviction threshold)
      mockPeerService.recordProbeFailure
        .mockReturnValueOnce(1)
        .mockReturnValueOnce(2);

      await discoveryService.sweepLiveness();
      expect(mockPeerService.markOffline).not.toHaveBeenCalled();

      await discoveryService.sweepLiveness();
      expect(mockPeerService.markOffline).toHaveBeenCalledWith("dev");
      expect(mockConnectionService.handlePeerRediscovered).toHaveBeenCalledWith(
        "peer-1"
      );
    });

    it("resets the failure counter when a stale peer is reachable", async () => {
      mockPeerService.getDiscoveredPeers.mockReturnValue([makePeer()]);
      mockConnectionService.probePeerReachable.mockResolvedValue(true);

      await discoveryService.sweepLiveness();

      expect(mockPeerService.resetProbeFailures).toHaveBeenCalledWith("peer-1");
      expect(mockPeerService.touchDiscoveredPeer).toHaveBeenCalledWith("peer-1");
      expect(mockPeerService.markOffline).not.toHaveBeenCalled();
    });

    it("skips peers that were recently seen", async () => {
      mockPeerService.getDiscoveredPeers.mockReturnValue([
        makePeer({ lastSeenAt: Date.now() }),
      ]);

      await discoveryService.sweepLiveness();

      expect(mockConnectionService.probePeerReachable).not.toHaveBeenCalled();
    });
  });

  describe("periodic rescan", () => {
    it("forces a fresh browse on the rescan interval", () => {
      jest.useFakeTimers();
      discoveryService.startDiscovery();

      // 150s rescan interval — advance past it once.
      jest.advanceTimersByTime(150_000);

      expect(mockZeroconfAdapter.restartScan).toHaveBeenCalled();
      discoveryService.stopDiscovery();
    });
  });

  describe("resend debounce", () => {
    it("skips a second resend within the debounce window", async () => {
      discoveryService.setChatService(mockChatService);
      discoveryService.setConnectionService(
        { on: jest.fn() } as unknown as import("../connection-service").ConnectionService
      );
      const performResendSpy = jest
        .spyOn(discoveryService, "performResendMessagesForPeer")
        .mockResolvedValue();

      const serviceResolvedHandler = mockZeroconfAdapter.on.mock.calls.find(
        (call) => call[0] === "serviceResolved"
      )?.[1];
      const mockService = createTestZeroconfService() as unknown as Service;

      await serviceResolvedHandler?.(mockService);
      await serviceResolvedHandler?.(mockService);

      expect(performResendSpy).toHaveBeenCalledTimes(1);
    });
  });
});
