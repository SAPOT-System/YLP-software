import { loginAsFixtureApi, register } from "@/features/auth/api/auth.api";
import {
  clearAccessToken,
  clearConnectionConfig,
  getStoredAccessToken,
  saveAccessToken,
} from "@/features/shared/core/stores/secure-config";
import { deleteItemAsync, setItemAsync } from "expo-secure-store";
import { DebugAuthService } from "../debug-auth-service";

jest.mock("@/features/auth/api/auth.api", () => ({
  register: jest.fn(),
  loginAsFixtureApi: jest.fn(),
}));

jest.mock("@/features/shared/core/stores/secure-config", () => ({
  saveAccessToken: jest.fn(),
  clearAccessToken: jest.fn(),
  clearConnectionConfig: jest.fn(),
  getStoredAccessToken: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedRegister = register as jest.Mock;
const mockedLoginAsFixtureApi = loginAsFixtureApi as jest.Mock;
const mockedSaveAccessToken = saveAccessToken as jest.Mock;
const mockedClearAccessToken = clearAccessToken as jest.Mock;
const mockedClearConnectionConfig = clearConnectionConfig as jest.Mock;
const mockedGetStoredAccessToken = getStoredAccessToken as jest.Mock;
const mockedDeleteItemAsync = deleteItemAsync as jest.Mock;
const mockedSetItemAsync = setItemAsync as jest.Mock;

describe("DebugAuthService", () => {
  let userService: {
    syncAuthenticatedUser: jest.Mock;
    syncGuestUser: jest.Mock;
    logout: jest.Mock;
    wipeDatabase: jest.Mock;
  };
  let userStore: {
    user: { id: string; username: string } | undefined;
    isGuest: boolean;
    isRescuer: boolean;
    isAdmin: boolean;
    setIsRescuer: jest.Mock;
    setIsAdmin: jest.Mock;
  };
  let service: DebugAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    userService = {
      syncAuthenticatedUser: jest.fn().mockResolvedValue(undefined),
      syncGuestUser: jest.fn().mockResolvedValue(undefined),
      logout: jest.fn().mockResolvedValue(undefined),
      wipeDatabase: jest.fn().mockResolvedValue(undefined),
    };
    userStore = {
      user: { id: "peer-1", username: "alice" },
      isGuest: false,
      isRescuer: false,
      isAdmin: false,
      setIsRescuer: jest.fn((value: boolean) => {
        userStore.isRescuer = value;
      }),
      setIsAdmin: jest.fn((value: boolean) => {
        userStore.isAdmin = value;
      }),
    };
    service = new DebugAuthService(userService as never, userStore as never);

    mockedRegister.mockResolvedValue({
      data: {
        id: "server-user-1",
        first_name: "Debug",
        last_name: "rescuer",
        phone_number: "",
        email: "",
        username: "debug_rescuer_abc123",
        detail: "ok",
        access_token: "server-access-token",
        refresh_token: "server-refresh-token",
      },
    });

    mockedLoginAsFixtureApi.mockResolvedValue({
      data: {
        id: "fixture-user-1",
        first_name: "QA",
        last_name: "Admin",
        phone_number: "",
        email: "",
        username: "qa_admin",
        detail: "Logged in as fixture account",
        access_token: "fixture-access-token",
        refresh_token: "fixture-refresh-token",
      },
    });
  });

  describe("seedTestUser", () => {
    it("wipes the previous user's data before registering the new fixture user", async () => {
      const callOrder: string[] = [];
      userService.wipeDatabase.mockImplementation(async () => {
        callOrder.push("wipeDatabase");
      });
      mockedRegister.mockImplementation(async () => {
        callOrder.push("register");
        return {
          data: {
            id: "server-user-1",
            first_name: "Debug",
            last_name: "rescuer",
            phone_number: "",
            email: "",
            username: "debug_rescuer_abc123",
            detail: "ok",
            access_token: "server-access-token",
            refresh_token: "server-refresh-token",
          },
        };
      });

      await service.seedTestUser("rescuer");

      expect(userService.wipeDatabase).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["wipeDatabase", "register"]);
    });

    it("registers the fixture user through the server /auth/ endpoint", async () => {
      await service.seedTestUser("rescuer");

      expect(mockedRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          username: expect.stringContaining("debug_rescuer_"),
          first_name: "Debug",
          last_name: "rescuer",
          terms_accepted: true,
          password: expect.any(String),
        })
      );
    });

    it("stores the server-issued access and refresh tokens", async () => {
      await service.seedTestUser("rescuer");

      expect(mockedSaveAccessToken).toHaveBeenCalledWith("server-access-token");
      expect(mockedSetItemAsync).toHaveBeenCalledWith(
        "refresh_token",
        "server-refresh-token"
      );
    });

    it("syncs the registered server user locally and sets the role", async () => {
      await service.seedTestUser("rescuer");

      expect(userService.syncAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: "server-user-1", username: "debug_rescuer_abc123" })
      );
      expect(userStore.setIsRescuer).toHaveBeenCalledWith(true);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(false);
    });

    it("seeds an admin test user", async () => {
      await service.seedTestUser("admin");

      expect(userStore.setIsRescuer).toHaveBeenCalledWith(false);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(true);
    });

    it("seeds a regular test user with neither role flag set", async () => {
      await service.seedTestUser("user");

      expect(userStore.setIsRescuer).toHaveBeenCalledWith(false);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(false);
    });
  });

  describe("loginAs", () => {
    it("wipes the previous user's data before logging in as the fixture", async () => {
      const callOrder: string[] = [];
      userService.wipeDatabase.mockImplementation(async () => {
        callOrder.push("wipeDatabase");
      });
      mockedLoginAsFixtureApi.mockImplementation(async () => {
        callOrder.push("loginAsFixtureApi");
        return {
          data: {
            id: "fixture-user-1",
            first_name: "QA",
            last_name: "Admin",
            phone_number: "",
            email: "",
            username: "qa_admin",
            detail: "ok",
            access_token: "fixture-access-token",
            refresh_token: "fixture-refresh-token",
          },
        };
      });

      await service.loginAs("qa_admin");

      expect(userService.wipeDatabase).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["wipeDatabase", "loginAsFixtureApi"]);
    });

    it("calls /testing/login-as with the given handle", async () => {
      await service.loginAs("qa_rescuer");

      expect(mockedLoginAsFixtureApi).toHaveBeenCalledWith("qa_rescuer");
    });

    it("stores the server-issued access and refresh tokens", async () => {
      await service.loginAs("qa_admin");

      expect(mockedSaveAccessToken).toHaveBeenCalledWith("fixture-access-token");
      expect(mockedSetItemAsync).toHaveBeenCalledWith(
        "refresh_token",
        "fixture-refresh-token"
      );
    });

    it("syncs the fixture user locally", async () => {
      await service.loginAs("qa_admin");

      expect(userService.syncAuthenticatedUser).toHaveBeenCalledWith(
        expect.objectContaining({ id: "fixture-user-1", username: "qa_admin" })
      );
    });

    it("sets the rescuer role flag when logging in as qa_rescuer", async () => {
      await service.loginAs("qa_rescuer");

      expect(userStore.setIsRescuer).toHaveBeenCalledWith(true);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(false);
    });

    it("sets the admin role flag when logging in as qa_admin", async () => {
      await service.loginAs("qa_admin");

      expect(userStore.setIsRescuer).toHaveBeenCalledWith(false);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(true);
    });

    it("sets neither role flag for the plain qa_baseline handles", async () => {
      await service.loginAs("qa_baseline");

      expect(userStore.setIsRescuer).toHaveBeenCalledWith(false);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(false);
    });

    it("does not call register", async () => {
      await service.loginAs("qa_admin");

      expect(mockedRegister).not.toHaveBeenCalled();
    });

    describe("qa_guest", () => {
      it("becomes a local guest without calling the fixture login API", async () => {
        // Arrange / Act — a guest has no server account, so there is nothing
        // to authenticate against and no 404 to hit.
        await service.loginAs("qa_guest");

        // Assert
        expect(mockedLoginAsFixtureApi).not.toHaveBeenCalled();
        expect(userService.syncAuthenticatedUser).not.toHaveBeenCalled();
        expect(mockedRegister).not.toHaveBeenCalled();
      });

      it("wipes the previous user's data before becoming a guest", async () => {
        // Arrange
        const callOrder: string[] = [];
        userService.wipeDatabase.mockImplementation(async () => {
          callOrder.push("wipeDatabase");
        });
        userService.syncGuestUser.mockImplementation(async () => {
          callOrder.push("syncGuestUser");
        });

        // Act
        await service.loginAs("qa_guest");

        // Assert
        expect(callOrder).toEqual(["wipeDatabase", "syncGuestUser"]);
      });

      it("stores no session, dropping any token left by a previous fixture login", async () => {
        // Arrange / Act
        await service.loginAs("qa_guest");

        // Assert
        expect(mockedDeleteItemAsync).toHaveBeenCalledWith("refresh_token");
        expect(mockedClearAccessToken).toHaveBeenCalledTimes(1);
        expect(mockedSaveAccessToken).not.toHaveBeenCalled();
      });

      it("syncs a guest carrying the qa_guest fixture identity", async () => {
        // Arrange / Act
        await service.loginAs("qa_guest");

        // Assert — mirrors the server fixture's first/last name
        expect(userService.syncGuestUser).toHaveBeenCalledWith({
          firstName: "QA",
          lastName: "Fixture",
          username: "qa.fixture",
        });
      });

      it("lands on the same identity every time, unlike the randomized LAN guest", async () => {
        // Arrange — vary Math.random, which is what randomizes seedLanUser
        const originalRandom = Math.random;
        try {
          Math.random = () => 0;
          await service.loginAs("qa_guest");
          Math.random = () => 0.999;
          await service.loginAs("qa_guest");
        } finally {
          Math.random = originalRandom;
        }

        // Assert
        const [first] = userService.syncGuestUser.mock.calls[0];
        const [second] = userService.syncGuestUser.mock.calls[1];
        expect(first).toEqual(second);
      });

      it("does not touch the role flags, since guests are never rescuer/admin", async () => {
        // Arrange / Act
        await service.loginAs("qa_guest");

        // Assert
        expect(userStore.setIsRescuer).not.toHaveBeenCalled();
        expect(userStore.setIsAdmin).not.toHaveBeenCalled();
      });
    });
  });

  describe("seedLanUser", () => {
    it("wipes the previous user's data before creating the new guest user", async () => {
      const callOrder: string[] = [];
      userService.wipeDatabase.mockImplementation(async () => {
        callOrder.push("wipeDatabase");
      });
      userService.syncGuestUser.mockImplementation(async () => {
        callOrder.push("syncGuestUser");
      });

      await service.seedLanUser();

      expect(userService.wipeDatabase).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(["wipeDatabase", "syncGuestUser"]);
    });

    it("deletes any leftover refresh and access token, since guests never hold a session", async () => {
      await service.seedLanUser();

      expect(mockedDeleteItemAsync).toHaveBeenCalledWith("refresh_token");
      expect(mockedClearAccessToken).toHaveBeenCalledTimes(1);
    });

    it("creates a guest/LAN user via UserService.syncGuestUser with a randomized first name", async () => {
      await service.seedLanUser();

      expect(userService.syncGuestUser).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: expect.any(String),
          lastName: "Lan",
        })
      );
      expect(userService.syncAuthenticatedUser).not.toHaveBeenCalled();
      expect(mockedRegister).not.toHaveBeenCalled();
    });

    it("varies the first name across seedings instead of always using the same one", async () => {
      const originalRandom = Math.random;
      try {
        Math.random = () => 0;
        await service.seedLanUser();
        const firstCall = userService.syncGuestUser.mock.calls[0][0].firstName;

        Math.random = () => 0.999;
        await service.seedLanUser();
        const secondCall = userService.syncGuestUser.mock.calls[1][0].firstName;

        expect(firstCall).not.toBe(secondCall);
      } finally {
        Math.random = originalRandom;
      }
    });

    it("does not touch the role flags, since guests are never rescuer/admin", async () => {
      await service.seedLanUser();

      expect(userStore.setIsRescuer).not.toHaveBeenCalled();
      expect(userStore.setIsAdmin).not.toHaveBeenCalled();
    });
  });

  describe("setRole", () => {
    it("switches the current user's role flags without seeding a new user", () => {
      service.setRole("admin");

      expect(userService.syncAuthenticatedUser).not.toHaveBeenCalled();
      expect(userStore.setIsRescuer).toHaveBeenCalledWith(false);
      expect(userStore.setIsAdmin).toHaveBeenCalledWith(true);
    });
  });

  describe("injectFakeAccessToken", () => {
    it("saves a generated fake token to secure storage", async () => {
      await service.injectFakeAccessToken();

      expect(mockedSaveAccessToken).toHaveBeenCalledWith(
        expect.stringContaining("debug.")
      );
    });
  });

  describe("clearAccessToken", () => {
    it("clears the token from secure storage", async () => {
      await service.clearAccessToken();

      expect(mockedClearAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe("forceLogout", () => {
    it("delegates to UserService.logout", async () => {
      await service.forceLogout();

      expect(userService.logout).toHaveBeenCalledTimes(1);
    });

    it("clears the refresh token and full connection config, mirroring production logout, so a restart lands on the login screen", async () => {
      await service.forceLogout();

      expect(mockedDeleteItemAsync).toHaveBeenCalledWith("refresh_token");
      expect(mockedClearConnectionConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetAuthState", () => {
    it("only clears the stored access token, leaving the session and local data intact", async () => {
      await service.resetAuthState();

      expect(mockedClearAccessToken).toHaveBeenCalledTimes(1);
      expect(userService.wipeDatabase).not.toHaveBeenCalled();
      expect(userService.logout).not.toHaveBeenCalled();
      expect(mockedDeleteItemAsync).not.toHaveBeenCalled();
    });
  });

  describe("getSnapshot", () => {
    it("reports the current user and token presence", async () => {
      mockedGetStoredAccessToken.mockResolvedValue("some-token");

      const snapshot = await service.getSnapshot();

      expect(snapshot).toEqual({
        userId: "peer-1",
        username: "alice",
        isGuest: false,
        isRescuer: false,
        isAdmin: false,
        hasAccessToken: true,
      });
    });

    it("reports null identity when no user is initialized", async () => {
      userStore.user = undefined;
      mockedGetStoredAccessToken.mockResolvedValue(undefined);

      const snapshot = await service.getSnapshot();

      expect(snapshot.userId).toBeNull();
      expect(snapshot.username).toBeNull();
      expect(snapshot.hasAccessToken).toBe(false);
    });
  });
});
