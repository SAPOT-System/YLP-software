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

    // Setup mocks
    mockPeerRepository = {
      isPeerExist: jest.fn(),
      savePeer: jest.fn(),
      markPeerOnline: jest.fn(),
      markPeerOffline: jest.fn(),
      queryAllPeers: jest.fn(),
      queryPeerById: jest.fn(),
    } as Partial<PeerRepository> as jest.Mocked<PeerRepository>;

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

      mockPeerRepository.isPeerExist.mockResolvedValue(true);
      const markOnlineSpy = jest
        .spyOn(peerService, "markOnline")
        .mockResolvedValue();

      await peerService.register(mockService);

      expect(mockPeerRepository.isPeerExist).toHaveBeenCalledWith("peer-1");
      expect(markOnlineSpy).toHaveBeenCalledWith("peer-1");
      expect(peerService.discoveredPeerServices).toContainEqual({
        serviceName: "test-device",
        id: "peer-1",
        port: 8080,
        ipAddress: "192.168.1.101",
      });
    });

    it("should save new peer and add to discovered services", async () => {
      const mockService: Service = {
        name: "new-device",
        host: "test-device.local",
        fullName: "test-device.local.tcp",
        port: 8081,
        addresses: ["192.168.1.102"],
        txt: {
          id: "peer-2",
          username: "newuser",
        },
      };
      mockPeerRepository.isPeerExist.mockResolvedValue(false);

      await peerService.register(mockService);

      expect(mockPeerRepository.isPeerExist).toHaveBeenCalledWith("peer-2");
      expect(mockPeerRepository.savePeer).toHaveBeenCalledWith({
        id: "peer-2",
        username: "newuser",
      });
      expect(peerService.discoveredPeerServices).toContainEqual({
        serviceName: "new-device",
        id: "peer-2",
        port: 8081,
        ipAddress: "192.168.1.102",
      });
    });

    it("should not add duplicate service to discovered services", async () => {
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

      // Pre-populate with existing service
      peerService.discoveredPeerServices = [
        {
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
        },
      ];

      mockPeerRepository.isPeerExist.mockResolvedValue(true);
      jest.spyOn(peerService, "markOnline").mockResolvedValue();

      await peerService.register(mockService);

      expect(peerService.discoveredPeerServices).toHaveLength(1);
    });

    it("should throw error if peer registration fails", async () => {
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

      mockPeerRepository.isPeerExist.mockRejectedValue(
        new Error("Database error")
      );

      await expect(peerService.register(mockService)).rejects.toThrow(
        "Database error"
      );
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
      peerService.discoveredPeerServices = [
        {
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
        },
        {
          serviceName: "other-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
        },
      ];

      await peerService.markOffline(serviceName);

      expect(mockPeerRepository.markPeerOffline).toHaveBeenCalledWith("peer-1");
      expect(peerService.discoveredPeerServices).toEqual([
        {
          serviceName: "other-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
        },
      ]);
    });

    it("should return early if service not found in discovered services", async () => {
      const serviceName = "non-existent-device";

      await peerService.markOffline(serviceName);

      expect(mockPeerRepository.markPeerOffline).not.toHaveBeenCalled();
      expect(peerService.discoveredPeerServices).toEqual([]);
    });

    it("should throw error if marking offline fails", async () => {
      peerService.discoveredPeerServices = [
        {
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
        },
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
        { id: "peer-1", username: "user1", isOnline: true },
        { id: "peer-2", username: "user2", isOnline: false },
      ] as Peer[];

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
      const mockPeer = {
        id: "peer-1",
        username: "user1",
        isOnline: true,
      } as Peer;

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
      const mockDiscoveredPeer: DiscoveredService = {
        serviceName: "test-device",
        id: "peer-1",
        port: 8080,
        ipAddress: "192.168.1.101",
      };

      peerService.discoveredPeerServices = [
        mockDiscoveredPeer,
        {
          serviceName: "other-device",
          id: "peer-2",
          port: 8081,
          ipAddress: "192.168.1.102",
        },
      ];

      const result = peerService.findDiscoveredPeerById(peerId);

      expect(result).toEqual(mockDiscoveredPeer);
    });

    it("should return undefined if peer not found", () => {
      const peerId = "non-existent-peer";

      peerService.discoveredPeerServices = [
        {
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
        },
      ];

      const result = peerService.findDiscoveredPeerById(peerId);

      expect(result).toBeUndefined();
    });
  });

  describe("createUser", () => {
    it("should create new user/peer in repository", async () => {
      const id = "user-1";
      const username = "testuser";
      const mockUser = { id, username, isOnline: false } as Peer;

      mockPeerRepository.savePeer.mockResolvedValue(mockUser);

      const result = await peerService.createUser(id, username);

      expect(mockPeerRepository.savePeer).toHaveBeenCalledWith({
        id,
        username,
      });
      expect(result).toEqual(mockUser);
    });

    it("should throw error if user creation fails", async () => {
      mockPeerRepository.savePeer.mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        peerService.createUser("user-1", "testuser")
      ).rejects.toThrow("Database error");
    });
  });

  describe("cleanUp", () => {
    it("should clear discovered peer services", () => {
      peerService.discoveredPeerServices = [
        {
          serviceName: "test-device",
          id: "peer-1",
          port: 8080,
          ipAddress: "192.168.1.101",
        },
      ];

      peerService.cleanUp();

      expect(peerService.discoveredPeerServices).toEqual([]);
    });
  });
});
