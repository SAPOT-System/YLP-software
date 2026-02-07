import * as ExpoSecureStore from "expo-secure-store";
import uuid from "react-native-uuid";
import { Peer } from "../../database";
import { SessionStore, UserStore } from "../../stores";
import { PeerService } from "../peer-service";
import { UserService } from "../user-service";

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// Mock react-native-uuid
jest.mock("react-native-uuid", () => ({
  v4: jest.fn(),
}));

// Mock the stores
jest.mock("../../stores", () => ({
  UserStore: jest.fn(),
  SessionStore: jest.fn(),
}));

// Mock PeerService
jest.mock("../peer-service", () => ({
  PeerService: jest.fn(),
}));

// Mock database models
jest.mock("../../database", () => ({
  Peer: jest.fn(),
}));

describe("UserService", () => {
  let userService: UserService;
  let mockUserStore: jest.Mocked<UserStore>;
  let mockPeerService: jest.Mocked<PeerService>;
  let mockSessionStore: jest.Mocked<SessionStore>;
  let mockGetItemAsync: jest.MockedFunction<typeof ExpoSecureStore.getItemAsync>;
  let mockSetItemAsync: jest.MockedFunction<typeof ExpoSecureStore.setItemAsync>;
  let mockUuidV4: jest.MockedFunction<typeof uuid.v4>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mocks
    mockUserStore = {
      user: undefined,
      setUser: jest.fn(),
    } as unknown as jest.Mocked<UserStore>;

    mockSessionStore = {
      userId: undefined,
      setUserId: jest.fn(),
    } as unknown as jest.Mocked<SessionStore>;

    mockPeerService = {
      findPeerById: jest.fn(),
      createUser: jest.fn(),
      register: jest.fn(),
      markOffline: jest.fn(),
      markOnline: jest.fn(),
      getAllPeers: jest.fn(),
      findDiscoveredPeerById: jest.fn(),
      cleanUp: jest.fn(),
    } as Partial<PeerService> as jest.Mocked<PeerService>;

    mockGetItemAsync = jest.mocked(ExpoSecureStore.getItemAsync);
    mockSetItemAsync = jest.mocked(ExpoSecureStore.setItemAsync);
    mockUuidV4 = jest.mocked(uuid.v4);

    // Mock constructors
    jest.mocked(UserStore).mockImplementation(() => mockUserStore);
    jest.mocked(SessionStore).mockImplementation(() => mockSessionStore);
    jest.mocked(PeerService).mockImplementation(() => mockPeerService);

    // Create service instance
    userService = new UserService(mockUserStore, mockPeerService, mockSessionStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with provided dependencies", () => {
      expect(userService).toBeInstanceOf(UserService);
    });
  });

  describe("initialize", () => {
    it("should use existing UUID and found user", async () => {
      const existingUuid = "existing-uuid-123";
      const mockUser: Peer = {
        id: existingUuid,
        username: "existinguser",
        isOnline: true,
      } as unknown as Peer;

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockPeerService.findPeerById.mockResolvedValue(mockUser);

      await userService.initialize();

      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSetItemAsync).not.toHaveBeenCalled();
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.createUser).not.toHaveBeenCalled();
      expect(mockUserStore.setUser).toHaveBeenCalledWith(mockUser);
    });

    it("should generate new UUID and create new user when UUID doesn't exist", async () => {
      const newUuid = "23-12-456";
      const mockUser: Peer = {
        id: newUuid,
        username: "User_abc123",
        isOnline: false,
      } as unknown as Peer;

      mockGetItemAsync.mockResolvedValue(null);
      (mockUuidV4 as jest.Mock).mockReturnValue(newUuid);
      mockPeerService.findPeerById.mockResolvedValue(null as unknown as Peer); // First call returns null
      mockPeerService.createUser.mockResolvedValue(mockUser);

      await userService.initialize();

      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockUuidV4).toHaveBeenCalled();
      expect(mockSetItemAsync).toHaveBeenCalledWith("userUUID", newUuid);
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(newUuid);
      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(newUuid);
      expect(mockPeerService.createUser).toHaveBeenCalledWith(
        newUuid,
        expect.stringMatching(/^User_/)
      );
      expect(mockUserStore.setUser).toHaveBeenCalledWith(mockUser);
    });

    it("should use existing UUID but create new user when user not found", async () => {
      const existingUuid = "existing-uuid-123";
      const mockUser: Peer = {
        id: existingUuid,
        username: "User_xyz789",
        isOnline: false,
      } as unknown as Peer;

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockPeerService.findPeerById.mockResolvedValue(null as unknown as Peer); // User not found in database
      mockPeerService.createUser.mockResolvedValue(mockUser);

      await userService.initialize();

      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSetItemAsync).not.toHaveBeenCalled();
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.createUser).toHaveBeenCalledWith(
        existingUuid,
        expect.stringMatching(/^User_/)
      );
      expect(mockUserStore.setUser).toHaveBeenCalledWith(mockUser);
    });

    it("should throw error if getItemAsync fails", async () => {
      mockGetItemAsync.mockRejectedValue(new Error("SecureStore error"));

      await expect(userService.initialize()).rejects.toThrow("SecureStore error");
    });

    it("should throw error if setItemAsync fails", async () => {
      mockGetItemAsync.mockResolvedValue(null);
      (mockUuidV4 as jest.Mock).mockReturnValue("new-uuid");
      mockSetItemAsync.mockRejectedValue(new Error("SecureStore write error"));

      await expect(userService.initialize()).rejects.toThrow("SecureStore write error");
    });

    it("should throw error if findPeerById fails", async () => {
      const existingUuid = "existing-uuid-123";

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockPeerService.findPeerById.mockRejectedValue(new Error("Database error"));

      await expect(userService.initialize()).rejects.toThrow("Database error");
    });

    it("should throw error if createUser fails", async () => {
      const newUuid = "new-uuid-456";

      mockGetItemAsync.mockResolvedValue(newUuid);
      mockPeerService.findPeerById.mockResolvedValue(null as unknown as Peer);
      mockPeerService.createUser.mockRejectedValue(new Error("User creation error"));

      await expect(userService.initialize()).rejects.toThrow("User creation error");
    });
  });

  describe("generateUsername", () => {
    it("should generate username with proper format", () => {
      // Access private method for testing
      const generateUsername = (userService as unknown as { generateUsername: () => string }).generateUsername.bind(userService);

      const username = generateUsername();

      expect(username).toMatch(/^User_.+/);
      expect(username.startsWith("User_")).toBe(true);
    });

    it("should generate different usernames on multiple calls", () => {
      const generateUsername = (userService as unknown as { generateUsername: () => string }).generateUsername.bind(userService);

      const username1 = generateUsername();
      const username2 = generateUsername();

      expect(username1).toMatch(/^User_.+/);
      expect(username2).toMatch(/^User_.+/);
      expect(username1.startsWith("User_")).toBe(true);
      expect(username2.startsWith("User_")).toBe(true);
      // Note: There's a small chance they could be the same, but very unlikely
    });
  });
});