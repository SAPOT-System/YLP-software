import React from "react";
import { Pressable, Text } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// All jest.mock factories use inline jest.fn() to avoid TDZ issues with const
// declarations (jest.mock is hoisted above const by babel-jest).
// Per-test configuration is done via jest.requireMock() in beforeEach.

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@/features/auth/hooks/use-user-service", () => ({
  useUserService: jest.fn(),
}));

jest.mock("@/features/auth/hooks/use-auth-container", () => ({
  useAuthContainer: jest.fn(),
}));

jest.mock("@/features/shared/core/api/client", () => ({
  setTokenRefreshCallback: jest.fn(),
  setNeedsReloginCallback: jest.fn(),
}));

jest.mock("@/features/shared", () => ({
  getUserApi: jest.fn(),
}));

jest.mock("@/features/shared/core/stores/secure-config", () => ({
  clearConnectionConfig: jest.fn(),
  getLockoutInfo: jest.fn(),
  saveLockoutInfo: jest.fn(),
  clearLockoutInfo: jest.fn(),
}));

jest.mock("@/features/shared/services/device-key-service", () => ({
  buildDeviceFields: jest.fn(),
  clearDeviceSigningKey: jest.fn(),
}));

jest.mock("@/features/auth/api", () => ({
  register: jest.fn(),
  loginApi: jest.fn(),
  logoutApi: jest.fn(),
  refreshTokenApi: jest.fn(),
  fetchChallengeApi: jest.fn(),
}));

jest.mock("@/features/auth/utils/token-utils", () => ({
  isTokenExpiredLocally: jest.fn(() => false),
}));

// Accessors for mocks — called after module init so requireMock is safe
const secureStore = () => jest.requireMock("expo-secure-store") as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  deleteItemAsync: jest.Mock;
};
const clientMock = () => jest.requireMock("@/features/shared/core/api/client") as {
  setTokenRefreshCallback: jest.Mock;
  setNeedsReloginCallback: jest.Mock;
};
const useUserServiceMock = () =>
  (jest.requireMock("@/features/auth/hooks/use-user-service") as { useUserService: jest.Mock })
    .useUserService;
const useAuthContainerMock = () =>
  (jest.requireMock("@/features/auth/hooks/use-auth-container") as { useAuthContainer: jest.Mock })
    .useAuthContainer;

// renderProvider requires auth-context inside the call so all mocks are
// initialized before the module loads (avoids TDZ with top-level import).
const renderProvider = () => {
  const { AuthProvider, useAuth } =
    require("../auth-context") as typeof import("../auth-context");

  const TestConsumer = () => {
    const auth = useAuth();
    const authRef = React.useRef(auth);
    authRef.current = auth;
    return (
      <>
        <Text testID="authenticated">{String(auth.isAuthenticated)}</Text>
        <Text testID="loading">{String(auth.loading)}</Text>
        <Text testID="needsRelogin">{String(auth.needsReloginForServer)}</Text>
        <Text testID="offlineExpired">{String(auth.isOfflineWithExpiredToken)}</Text>
        <Pressable
          testID="login-btn"
          onPress={() =>
            authRef.current.login({ username: "test", password: "test" })
          }
        />
      </>
    );
  };

  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
};

const makeUserService = (overrides: Record<string, unknown> = {}) => ({
  getUser: jest.fn().mockReturnValue({ id: "uuid-123", username: "rescuer" }),
  initialize: jest.fn().mockResolvedValue(undefined),
  getIsRescuer: jest.fn(() => false),
  getIsAdmin: jest.fn(() => false),
  syncAuthenticatedUser: jest.fn().mockResolvedValue(undefined),
  isCurrentUserGuest: jest.fn().mockResolvedValue(false),
  logout: jest.fn(),
  wipeDatabase: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeAuthContainer = () => ({
  guestUserRepository: { getCurrentGuestUser: jest.fn() },
  guestMigrationService: {},
  peerService: { findPeerById: jest.fn() },
});

describe("AuthProvider bootstrap — local-first identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUserServiceMock().mockReturnValue(makeUserService());
    useAuthContainerMock().mockReturnValue(makeAuthContainer());
    secureStore().getItemAsync.mockResolvedValue(null);
    secureStore().setItemAsync.mockResolvedValue(undefined);
    secureStore().deleteItemAsync.mockResolvedValue(undefined);

    const secureConfig = jest.requireMock("@/features/shared/core/stores/secure-config") as {
      getLockoutInfo: jest.Mock;
      saveLockoutInfo: jest.Mock;
      clearLockoutInfo: jest.Mock;
    };
    secureConfig.getLockoutInfo.mockResolvedValue(null);
    secureConfig.saveLockoutInfo.mockResolvedValue(undefined);
    secureConfig.clearLockoutInfo.mockResolvedValue(undefined);

    const deviceKeyService = jest.requireMock("@/features/shared/services/device-key-service") as {
      buildDeviceFields: jest.Mock;
      clearDeviceSigningKey: jest.Mock;
    };
    deviceKeyService.buildDeviceFields.mockResolvedValue(null);
    deviceKeyService.clearDeviceSigningKey.mockReturnValue(undefined);
  });

  it("sets isAuthenticated=true when userUUID and local DB record exist", async () => {
    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("some-token");
      return Promise.resolve(null);
    });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
      expect(getByTestId("loading").props.children).toBe("false");
    });
  });

  it("does not call getUserApi when local identity is confirmed", async () => {
    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("some-token");
      return Promise.resolve(null);
    });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
    });

    const { getUserApi } = jest.requireMock("@/features/shared") as { getUserApi: jest.Mock };
    expect(getUserApi).not.toHaveBeenCalled();
  });

  it("registers setTokenRefreshCallback and setNeedsReloginCallback on mount", async () => {
    renderProvider();

    await waitFor(() => {
      expect(clientMock().setTokenRefreshCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
      expect(clientMock().setNeedsReloginCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  it("sets needsReloginForServer=true when the server explicitly rejects the session mid-flight", async () => {
    const userService = makeUserService();
    useUserServiceMock().mockReturnValue(userService);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("some-token");
      return Promise.resolve(null);
    });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
      expect(clientMock().setNeedsReloginCallback).toHaveBeenCalled();
    });

    const onNeedsRelogin = clientMock().setNeedsReloginCallback.mock.calls[0][0] as () => void;
    onNeedsRelogin();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });

    expect(getByTestId("authenticated").props.children).toBe("true");
    expect(userService.logout).not.toHaveBeenCalled();
  });

  it("stays unauthenticated when no userUUID and no guest session", async () => {
    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("false");
      expect(getByTestId("loading").props.children).toBe("false");
    });
  });

  it("does NOT logout when refreshSession fails due to a network error (server unavailable)", async () => {
    const userService = makeUserService({
      initialize: jest.fn().mockRejectedValue(new Error("no local record")),
    });
    useUserServiceMock().mockReturnValue(userService);

    const container = makeAuthContainer();
    (container.peerService.findPeerById as jest.Mock).mockResolvedValue({
      id: "uuid-123",
      username: "rescuer",
      firstName: "Rescue",
      lastName: "User",
      email: "r@example.com",
      phoneNumber: null,
      emailVerified: true,
    });
    useAuthContainerMock().mockReturnValue(container);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "refresh_token") return Promise.resolve("some-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
    };
    // Simulate server unavailable — no .response on the error
    refreshTokenApi.mockRejectedValue(new Error("Network Error"));

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
      expect(getByTestId("loading").props.children).toBe("false");
    });

    expect(secureStore().deleteItemAsync).not.toHaveBeenCalledWith("access_token");
    expect(secureStore().deleteItemAsync).not.toHaveBeenCalledWith("refresh_token");
    expect(userService.logout).not.toHaveBeenCalled();
  });

  it("logs out and clears tokens when no local record and server returns 401 during refresh", async () => {
    const userService = makeUserService({
      initialize: jest.fn().mockRejectedValue(new Error("no local record")),
    });
    useUserServiceMock().mockReturnValue(userService);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "refresh_token") return Promise.resolve("expired-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
    };
    refreshTokenApi.mockRejectedValue({ response: { status: 401 } });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("false");
      expect(getByTestId("loading").props.children).toBe("false");
    });

    expect(secureStore().deleteItemAsync).toHaveBeenCalledWith("access_token");
    expect(secureStore().deleteItemAsync).toHaveBeenCalledWith("refresh_token");
    expect(userService.logout).toHaveBeenCalled();
  });

  it("sets needsReloginForServer=true and keeps user authenticated when local record exists but server returns 401", async () => {
    const { isTokenExpiredLocally } = jest.requireMock(
      "@/features/auth/utils/token-utils"
    ) as { isTokenExpiredLocally: jest.Mock };
    isTokenExpiredLocally.mockReturnValue(true);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("expired-access-token");
      if (key === "refresh_token") return Promise.resolve("expired-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
    };
    refreshTokenApi.mockRejectedValue({ response: { status: 401 } });

    const userService = makeUserService();
    useUserServiceMock().mockReturnValue(userService);

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });

    expect(getByTestId("authenticated").props.children).toBe("true");
    expect(userService.logout).not.toHaveBeenCalled();
    expect(secureStore().deleteItemAsync).not.toHaveBeenCalledWith("access_token");
    expect(secureStore().deleteItemAsync).not.toHaveBeenCalledWith("refresh_token");
  });

  it("sets needsReloginForServer=true on restart when tokens were already deleted by the interceptor in the previous session", async () => {
    const { isTokenExpiredLocally } = jest.requireMock(
      "@/features/auth/utils/token-utils"
    ) as { isTokenExpiredLocally: jest.Mock };
    isTokenExpiredLocally.mockReturnValue(true);

    // Simulate restart after interceptor cleared tokens: userUUID present but tokens gone
    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve(null);
      if (key === "refresh_token") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });

    expect(getByTestId("authenticated").props.children).toBe("true");
  });

  it("sets isOfflineWithExpiredToken=true when server unreachable and token was locally expired", async () => {
    const { isTokenExpiredLocally } = jest.requireMock(
      "@/features/auth/utils/token-utils"
    ) as { isTokenExpiredLocally: jest.Mock };
    isTokenExpiredLocally.mockReturnValue(true);

    const container = makeAuthContainer();
    (container.peerService.findPeerById as jest.Mock).mockResolvedValue({
      id: "uuid-123",
      username: "rescuer",
      firstName: "Rescue",
      lastName: "User",
      email: "r@example.com",
      phoneNumber: null,
      emailVerified: true,
    });
    useAuthContainerMock().mockReturnValue(container);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("expired-access-token");
      if (key === "refresh_token") return Promise.resolve("expired-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
    };
    refreshTokenApi.mockRejectedValue(new Error("Network Error"));

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("offlineExpired").props.children).toBe("true");
    });

    expect(getByTestId("authenticated").props.children).toBe("true");
    expect(getByTestId("needsRelogin").props.children).toBe("false");
  });

  it("leaves isOfflineWithExpiredToken=false when server unreachable but token is still valid", async () => {
    const { isTokenExpiredLocally } = jest.requireMock(
      "@/features/auth/utils/token-utils"
    ) as { isTokenExpiredLocally: jest.Mock };
    isTokenExpiredLocally.mockReturnValue(false);

    const container = makeAuthContainer();
    (container.peerService.findPeerById as jest.Mock).mockResolvedValue({
      id: "uuid-123",
      username: "rescuer",
      firstName: "Rescue",
      lastName: "User",
      email: "r@example.com",
      phoneNumber: null,
      emailVerified: true,
    });
    useAuthContainerMock().mockReturnValue(container);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("valid-token");
      if (key === "refresh_token") return Promise.resolve("some-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
    };
    refreshTokenApi.mockRejectedValue(new Error("Network Error"));

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
      expect(getByTestId("loading").props.children).toBe("false");
    });

    expect(getByTestId("offlineExpired").props.children).toBe("false");
  });

  it("returns attemptsRemaining when server responds 401 with dict detail", async () => {
    const { loginApi } = jest.requireMock("@/features/auth/api") as { loginApi: jest.Mock };
    loginApi.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { detail: { message: "Incorrect credentials", attempts_remaining: 6 } },
      },
    });

    let loginResult: { success: boolean; attemptsRemaining?: number } | null = null;
    const { AuthProvider, useAuth } = require("../auth-context") as typeof import("../auth-context");

    const TestCapture = () => {
      const auth = useAuth();
      const authRef = React.useRef(auth);
      authRef.current = auth;
      return (
        <Pressable
          testID="capture-login-btn"
          onPress={async () => {
            loginResult = await authRef.current.login({ username: "user", password: "wrong" });
          }}
        />
      );
    };

    const { getByTestId } = render(
      <AuthProvider>
        <TestCapture />
      </AuthProvider>
    );

    fireEvent.press(getByTestId("capture-login-btn"));

    await waitFor(() => {
      expect(loginResult).not.toBeNull();
    });

    expect(loginResult!.success).toBe(false);
    expect(loginResult!.attemptsRemaining).toBe(6);
  });

  it("does not include attemptsRemaining when server responds 401 with string detail", async () => {
    const { loginApi } = jest.requireMock("@/features/auth/api") as { loginApi: jest.Mock };
    loginApi.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { detail: "Incorrect credentials" },
      },
    });

    let loginResult: { success: boolean; attemptsRemaining?: number } | null = null;
    const { AuthProvider, useAuth } = require("../auth-context") as typeof import("../auth-context");

    const TestCapture = () => {
      const auth = useAuth();
      const authRef = React.useRef(auth);
      authRef.current = auth;
      return (
        <Pressable
          testID="capture-login-btn-str"
          onPress={async () => {
            loginResult = await authRef.current.login({ username: "user", password: "wrong" });
          }}
        />
      );
    };

    const { getByTestId } = render(
      <AuthProvider>
        <TestCapture />
      </AuthProvider>
    );

    fireEvent.press(getByTestId("capture-login-btn-str"));

    await waitFor(() => {
      expect(loginResult).not.toBeNull();
    });

    expect(loginResult!.success).toBe(false);
    expect(loginResult!.attemptsRemaining).toBeUndefined();
  });

  it("does not wipe database when relogin attempt fails with wrong credentials", async () => {
    const { isTokenExpiredLocally } = jest.requireMock(
      "@/features/auth/utils/token-utils"
    ) as { isTokenExpiredLocally: jest.Mock };
    isTokenExpiredLocally.mockReturnValue(true);

    const userService = makeUserService();
    useUserServiceMock().mockReturnValue(userService);

    secureStore().getItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("expired-access-token");
      if (key === "refresh_token") return Promise.resolve("expired-refresh-token");
      return Promise.resolve(null);
    });

    const { refreshTokenApi, loginApi } = jest.requireMock("@/features/auth/api") as {
      refreshTokenApi: jest.Mock;
      loginApi: jest.Mock;
    };
    refreshTokenApi.mockRejectedValue({ response: { status: 401 } });
    loginApi.mockRejectedValue({ response: { status: 401, data: { detail: "Bad credentials" } } });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });

    fireEvent.press(getByTestId("login-btn"));

    await waitFor(() => {
      expect(loginApi).toHaveBeenCalled();
    });

    expect(userService.wipeDatabase).not.toHaveBeenCalled();
  });
});
