import {
    createTestDiscoveredService,
    createTestDiscoveredServices,
    createTestZeroconfService,
} from "@/test/factories/peer-service.factory";
import { createTestPeer } from "@/test/factories/user.factory";
import { createPeerRepositoryMock } from "@/test/mocks/service.mock-builders";
import { Service } from "react-native-zeroconf";
import { Peer } from "../../database";
import { PeerRepository } from "../../repositories";
import { DiscoveredService } from "../../types";
import { PeerService } from "../peer-service";

// Mock the repositories
jest.mock("../../repositories", () => ({
  PeerRepository: jest.fn(),
}));

describe("PeerService", () => {
  let peerService: PeerService;
  let mockPeerRepository: jest.Mocked<PeerRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPeerRepository =
      createPeerRepositoryMock() as unknown as jest.Mocked<PeerRepository>;

    // Mock constructor
    jest.mocked(PeerRepository).mockImplementation(() => mockPeerRepository);

    // Create service instance
    peerService = new PeerService(mockPeerRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with empty discoveredPeerServices", () => {
      expect(peerService).toBeInstanceOf(PeerService);
      expect(peerService.discoveredPeerServices).toEqual([]);
    });
  });

  describe("register", () => {
    it("should mark existing peer as online and add to discovered services", async () => {
      const mockService = createTestZeroconfService() as unknown as Service;

      await peerService.register(mockService);

      expect(mockPeerRepository.createOrUpdatePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "peer-1",
          username: "peeruser",
        }),
        { markOnline: true }
      );
      expect(peerService.discoveredPeerServices).toContainEqual(
        expect.objectContaining({
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
          addresses: ["192.168.1.101"],
        })
      );
    });

    it("should save new peer and add to discovered services", async () => {
      const mockService = createTestZeroconfService({
        name: "new-device",
        port: 8081,
        addresses: ["192.168.1.102"],
        txt: { id: "peer-2", username: "newuser" },
      }) as unknown as Service;

      await peerService.register(mockService);

      expect(mockPeerRepository.createOrUpdatePeer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "peer-2",
          username: "newuser",
        }),
        { markOnline: true }
      );
      expect(peerService.discoveredPeerServices).toContainEqual(
        expect.objectContaining({
          serviceName: "new-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
          addresses: ["192.168.1.102"],
        })
      );
    });

    it("should not add duplicate service to discovered services", async () => {
      const mockService = createTestZeroconfService() as unknown as Service;

      // Pre-populate with existing service
      peerService.discoveredPeerServices = [createTestDiscoveredService()];

      await peerService.register(mockService);

      expect(peerService.discoveredPeerServices).toHaveLength(1);
    });

    it("should throw error if peer registration fails", async () => {
      const mockService = createTestZeroconfService() as unknown as Service;

      mockPeerRepository.createOrUpdatePeer.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.register(mockService)).rejects.toThrow(
        "Database error"
      );
    });

    it("should skip registration when peer id is missing", async () => {
      const mockService = createTestZeroconfService({
        txt: { id: "" },
      }) as unknown as Service;

      await peerService.register(mockService);

      expect(mockPeerRepository.createOrUpdatePeer).not.toHaveBeenCalled();
      expect(peerService.discoveredPeerServices).toHaveLength(0);
    });
  });

  describe("markOnline", () => {
    it("should mark peer as online in repository", async () => {
      const peerId = "peer-1";

      await peerService.markOnline(peerId);

      expect(mockPeerRepository.markPeerOnline).toHaveBeenCalledWith(peerId);
    });

    it("should throw error if marking online fails", async () => {
      mockPeerRepository.markPeerOnline.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.markOnline("peer-1")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("markOffline", () => {
    it("should mark peer as offline and remove from discovered services", async () => {
      const serviceName = "test-device";

      // Pre-populate discovered services
      peerService.discoveredPeerServices = createTestDiscoveredServices(2, (i) =>
        i === 0
          ? { serviceName: "test-device", id: "peer-1", port: 8080, ipAddress: "192.168.1.101" }
          : { serviceName: "other-device", id: "peer-2", port: 8081, ipAddress: "192.168.1.102" }
      );

      await peerService.markOffline(serviceName);

      expect(mockPeerRepository.markPeerOffline).toHaveBeenCalledWith("peer-1");
      expect(peerService.discoveredPeerServices).toHaveLength(1);
      expect(peerService.discoveredPeerServices[0]).toEqual(
        expect.objectContaining({
          serviceName: "other-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
        })
      );
    });

    it("should return early if service not found in discovered services", async () => {
      const serviceName = "non-existent-device";

      await peerService.markOffline(serviceName);

      expect(mockPeerRepository.markPeerOffline).not.toHaveBeenCalled();
      expect(peerService.discoveredPeerServices).toEqual([]);
    });

    it("should throw error if marking offline fails", async () => {
      peerService.discoveredPeerServices = [
        createTestDiscoveredService(),
      ];

      mockPeerRepository.markPeerOffline.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.markOffline("test-device")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("getAllPeers", () => {
    it("should return all peers from repository", async () => {
      const mockPeers = [
        createTestPeer({ id: "peer-1", username: "user1", isOnline: true }),
        createTestPeer({ id: "peer-2", username: "user2", isOnline: false }),
      ] as unknown as Peer[];

      mockPeerRepository.queryAllPeers.mockResolvedValue(mockPeers);

      const result = await peerService.getAllPeers();

      expect(mockPeerRepository.queryAllPeers).toHaveBeenCalled();
      expect(result).toEqual(mockPeers);
    });

    it("should throw error if query fails", async () => {
      mockPeerRepository.queryAllPeers.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.getAllPeers()).rejects.toThrow("Database error");
    });
  });

  describe("findPeerById", () => {
    it("should return peer by id from repository", async () => {
      const peerId = "peer-1";
      const mockPeer = createTestPeer({
        id: "peer-1",
        username: "user1",
        isOnline: true,
      }) as unknown as Peer;

      mockPeerRepository.queryPeerById.mockResolvedValue(mockPeer);

      const result = await peerService.findPeerById(peerId);

      expect(mockPeerRepository.queryPeerById).toHaveBeenCalledWith(peerId);
      expect(result).toEqual(mockPeer);
    });

    it("should throw error if query fails", async () => {
      mockPeerRepository.queryPeerById.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.findPeerById("peer-1")).rejects.toThrow(
        "Database error"
      );
    });
  });

  describe("findDiscoveredPeerById", () => {
    it("should return discovered peer by id", () => {
      const peerId = "peer-1";
      const mockDiscoveredPeer =
        createTestDiscoveredService() as unknown as DiscoveredService;

      peerService.discoveredPeerServices = [
        mockDiscoveredPeer,
        createTestDiscoveredService({
          serviceName: "other-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
        }),
      ];

      const result = peerService.findDiscoveredPeerById(peerId);

      expect(result).toEqual(mockDiscoveredPeer);
    });

    it("should return undefined if peer not found", () => {
      const peerId = "non-existent-peer";

      peerService.discoveredPeerServices = [createTestDiscoveredService()];

      const result = peerService.findDiscoveredPeerById(peerId);

      expect(result).toBeUndefined();
    });
  });

  describe("createUser", () => {
    it("should create new user/peer in repository", async () => {
      const id = "user-1";
      const username = "testuser";
      const firstName = "First Name";
      const mockUser = createTestPeer({ id, username, isOnline: false }) as unknown as Peer;

      mockPeerRepository.savePeer.mockResolvedValue(mockUser);

      const result = await peerService.createUser(id, username, firstName);

      expect(mockPeerRepository.savePeer).toHaveBeenCalledWith({
        id,
        username,
        firstName,
        lastName: undefined,
        email: undefined,
        phoneNumber: undefined,
      });
      expect(result).toEqual(mockUser);
    });

    it("should throw error if user creation fails", async () => {
      mockPeerRepository.savePeer.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        peerService.createUser("user-1", "testuser", "usertest")
      ).rejects.toThrow("Database error");
    });

    it("should pass optional fields to repository", async () => {
      const mockUser = createTestPeer({ id: "user-3", username: "optional" }) as unknown as Peer;
      mockPeerRepository.savePeer.mockResolvedValue(mockUser);

      await peerService.createUser(
        "user-3",
        "optional",
        "First",
        "Last",
        "optional@example.com",
        "+10000000000"
      );

      expect(mockPeerRepository.savePeer).toHaveBeenCalledWith({
        id: "user-3",
        username: "optional",
        firstName: "First",
        lastName: "Last",
        email: "optional@example.com",
        phoneNumber: "+10000000000",
      });
    });
  });

  describe("cleanUp", () => {
    it("should clear discovered peer services", () => {
      peerService.discoveredPeerServices = [createTestDiscoveredService()];

      peerService.cleanUp();

      expect(peerService.discoveredPeerServices).toEqual([]);
    });
  });

  describe("selectPreferredAddress", () => {
    it("returns empty string for no addresses", () => {
      expect(PeerService.selectPreferredAddress([])).toBe("");
    });

    it("prefers an address on the same /24 subnet as the local IP", () => {
      const result = PeerService.selectPreferredAddress(
        ["10.0.0.5", "192.168.1.50"],
        "192.168.1.100"
      );
      expect(result).toBe("192.168.1.50");
    });

    it("falls back to the first address when none share the subnet", () => {
      const result = PeerService.selectPreferredAddress(
        ["10.0.0.5", "172.16.0.9"],
        "192.168.1.100"
      );
      expect(result).toBe("10.0.0.5");
    });

    it("falls back to the first address when no local IP is given", () => {
      expect(
        PeerService.selectPreferredAddress(["10.0.0.5", "10.0.0.6"])
      ).toBe("10.0.0.5");
    });
  });

  describe("liveness helpers", () => {
    it("increments and resets the probe failure counter", () => {
      expect(peerService.recordProbeFailure("peer-1")).toBe(1);
      expect(peerService.recordProbeFailure("peer-1")).toBe(2);
      peerService.resetProbeFailures("peer-1");
      expect(peerService.recordProbeFailure("peer-1")).toBe(1);
    });

    it("refreshes lastSeenAt for a discovered peer", () => {
      const peer = createTestDiscoveredService({ lastSeenAt: 0 });
      peerService.discoveredPeerServices = [peer];

      peerService.touchDiscoveredPeer(peer.id);

      expect(peerService.getDiscoveredPeers()[0].lastSeenAt).toBeGreaterThan(0);
    });

    it("register refreshes lastSeenAt and clears prior probe failures", async () => {
      peerService.recordProbeFailure("peer-1");
      const mockService = createTestZeroconfService() as unknown as Service;

      await peerService.register(mockService);

      // counter was cleared, so the next failure starts back at 1
      expect(peerService.recordProbeFailure("peer-1")).toBe(1);
    });
  });
});
