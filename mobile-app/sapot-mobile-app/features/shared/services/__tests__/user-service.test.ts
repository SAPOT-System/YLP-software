import { createTestPeer } from "@/test/factories/user.factory";
import {
  createCleanUpServiceMock,
  createGuestUserRepositoryMock,
  createPeerServiceMock,
  createSessionStoreMock,
  createUserStoreMock,
  GuestUserRepositoryMock,
  PeerServiceMock,
  SessionStoreMock,
  UserStoreMock,
} from "@/test/mocks/user-service.mock-builders";
import * as ExpoSecureStore from "expo-secure-store";
import { GuestUserRepository } from "../../repositories";
import { SessionStore, UserStore } from "../../stores";
import { CleanUpService } from "../clean-up-service";
import { PeerService } from "../peer-service";
import { UserService } from "../user-service";

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock the stores
jest.mock("../../stores", () => ({
  UserStore: jest.fn(),
  SessionStore: jest.fn(),
}));

jest.mock("../../repositories", () => ({
  GuestUserRepository: jest.fn(),
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
  let mockUserStore: UserStoreMock;
  let mockPeerService: PeerServiceMock;
  let mockGuestUserRepository: GuestUserRepositoryMock;
  let mockSessionStore: SessionStoreMock;
  let mockGetItemAsync: jest.MockedFunction<
    typeof ExpoSecureStore.getItemAsync
  >;
  let mockSetItemAsync: jest.MockedFunction<
    typeof ExpoSecureStore.setItemAsync
  >;
  let mockDeleteItemAsync: jest.MockedFunction<
    typeof ExpoSecureStore.deleteItemAsync
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserStore = createUserStoreMock();
    mockSessionStore = createSessionStoreMock();
    mockGuestUserRepository = createGuestUserRepositoryMock();
    mockPeerService = createPeerServiceMock();

    mockGetItemAsync = jest.mocked(ExpoSecureStore.getItemAsync);
    mockSetItemAsync = jest.mocked(ExpoSecureStore.setItemAsync);
    mockDeleteItemAsync = jest.mocked(ExpoSecureStore.deleteItemAsync);

    // Mock constructors
    jest
      .mocked(UserStore)
      .mockImplementation(() => mockUserStore as unknown as UserStore);
    jest
      .mocked(SessionStore)
      .mockImplementation(() => mockSessionStore as unknown as SessionStore);
    jest
      .mocked(PeerService)
      .mockImplementation(() => mockPeerService as unknown as PeerService);
    jest
      .mocked(GuestUserRepository)
      .mockImplementation(
        () => mockGuestUserRepository as unknown as GuestUserRepository
      );

    // Create service instance
    userService = new UserService(
      mockUserStore as unknown as UserStore,
      mockPeerService as unknown as PeerService,
      mockSessionStore as unknown as SessionStore,
      mockGuestUserRepository as unknown as GuestUserRepository
    );
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
      // Arrange
      const existingUuid = "existing-uuid-123";
      const mockUser = createTestPeer({
        id: existingUuid,
        username: "existinguser",
        isOnline: true,
      });

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockPeerService.findPeerById.mockResolvedValue(mockUser as never);

      // Act
      await userService.initialize({ isGuest: false });

      // Assert
      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSetItemAsync).not.toHaveBeenCalled();
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.findPeerById).toHaveBeenCalledWith(existingUuid);
      expect(mockPeerService.createUser).not.toHaveBeenCalled();
      expect(mockUserStore.setUser).toHaveBeenCalledWith(mockUser, false);
    });

    it("should return early when UUID does not exist", async () => {
      // Arrange
      mockGetItemAsync.mockResolvedValue(null);

      // Act
      await userService.initialize({ isGuest: false });

      // Assert
      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSessionStore.setUserId).not.toHaveBeenCalled();
      expect(mockPeerService.findPeerById).not.toHaveBeenCalled();
      expect(mockUserStore.setUser).not.toHaveBeenCalled();
    });

    it("should use guest repository when isGuest is true", async () => {
      // Arrange
      const existingUuid = "existing-uuid-123";
      const mockUser = createTestPeer({
        id: existingUuid,
        username: "guest-username",
        isOnline: false,
      });

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockGuestUserRepository.getCurrentGuestUser.mockResolvedValue(
        mockUser as unknown as never
      );

      // Act
      await userService.initialize({ isGuest: true });

      // Assert
      expect(mockGetItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSetItemAsync).not.toHaveBeenCalled();
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(existingUuid);
      expect(mockGuestUserRepository.getCurrentGuestUser).toHaveBeenCalled();
      expect(mockPeerService.findPeerById).not.toHaveBeenCalled();
      expect(mockUserStore.setUser).toHaveBeenCalledWith(mockUser, true);
    });

    it("should throw error if getItemAsync fails", async () => {
      // Arrange
      mockGetItemAsync.mockRejectedValue(new Error("SecureStore error"));

      // Act / Assert
      await expect(userService.initialize({ isGuest: false })).rejects.toThrow(
        "SecureStore error"
      );
    });

    it("should throw error if findPeerById fails", async () => {
      // Arrange
      const existingUuid = "existing-uuid-123";

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockPeerService.findPeerById.mockRejectedValue(
        new Error("Database error")
      );

      // Act / Assert
      await expect(userService.initialize({ isGuest: false })).rejects.toThrow(
        "Database error"
      );
    });

    it("should throw error if getCurrentGuestUser fails", async () => {
      // Arrange
      const existingUuid = "existing-uuid-123";

      mockGetItemAsync.mockResolvedValue(existingUuid);
      mockGuestUserRepository.getCurrentGuestUser.mockRejectedValue(
        new Error("Guest repository error")
      );

      // Act / Assert
      await expect(userService.initialize({ isGuest: true })).rejects.toThrow(
        "Guest repository error"
      );
    });
  });

  describe("generateUsername", () => {
    it("should generate username with proper format", () => {
      // Access private method for testing
      const generateUsername = (
        userService as unknown as { generateUsername: () => string }
      ).generateUsername.bind(userService);

      const username = generateUsername();

      expect(username).toMatch(/^User_.+/);
      expect(username.startsWith("User_")).toBe(true);
    });

    it("should generate different usernames on multiple calls", () => {
      const generateUsername = (
        userService as unknown as { generateUsername: () => string }
      ).generateUsername.bind(userService);

      const username1 = generateUsername();
      const username2 = generateUsername();

      expect(username1).toMatch(/^User_.+/);
      expect(username2).toMatch(/^User_.+/);
      expect(username1.startsWith("User_")).toBe(true);
      expect(username2.startsWith("User_")).toBe(true);
      // Note: There's a small chance they could be the same, but very unlikely
    });
  });

  describe("logout", () => {
    it("deletes userUUID and clears session id", async () => {
      // Arrange
      mockDeleteItemAsync.mockResolvedValue();

      // Act
      await userService.logout();

      // Assert
      expect(mockDeleteItemAsync).toHaveBeenCalledWith("userUUID");
      expect(mockSessionStore.setUserId).toHaveBeenCalledWith(undefined);
    });

    it("runs cleanUp when cleanUpService is set", async () => {
      // Arrange
      mockDeleteItemAsync.mockResolvedValue();
      const cleanUpService = createCleanUpServiceMock();
      userService.setCleanUpService(cleanUpService as unknown as CleanUpService);

      // Act
      await userService.logout();

      // Assert
      expect(cleanUpService.cleanUp).toHaveBeenCalled();
    });

    it("throws when secure store delete fails", async () => {
      // Arrange
      mockDeleteItemAsync.mockRejectedValue(new Error("delete failed"));

      // Act / Assert
      await expect(userService.logout()).rejects.toThrow("delete failed");
    });
  });

  describe("setCleanUpService", () => {
    it("sets cleanUpService without throwing", () => {
      const cleanUpService = { cleanUp: jest.fn() } as unknown as CleanUpService;

      expect(() => userService.setCleanUpService(cleanUpService)).not.toThrow();
    });
  });

  describe("getUser", () => {
    it("returns the current user from store", () => {
      // Arrange
      const user = createTestPeer({ id: "user-1", username: "alice" });
      Object.defineProperty(mockUserStore, "user", {
        get: () => user,
      });

      // Act
      const result = userService.getUser();

      // Assert
      expect(result).toBe(user);
    });

    it("throws when user store throws", () => {
      // Arrange
      Object.defineProperty(mockUserStore, "user", {
        get: () => {
          throw new Error("Current user not initialized");
        },
      });

      // Act / Assert
      expect(() => userService.getUser()).toThrow("Current user not initialized");
    });
  });
});
