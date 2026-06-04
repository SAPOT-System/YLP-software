import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

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

jest.mock("@/features/shared/api/client", () => ({
  setTokenRefreshCallback: jest.fn(),
  setAuthFailureCallback: jest.fn(),
}));

jest.mock("@/features/shared", () => ({
  getUserApi: jest.fn(),
}));

jest.mock("@/features/shared/stores/secure-config", () => ({
  clearConnectionConfig: jest.fn(),
}));

jest.mock("@/features/auth/api", () => ({
  register: jest.fn(),
  loginApi: jest.fn(),
  logoutApi: jest.fn(),
  refreshTokenApi: jest.fn(),
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
const clientMock = () => jest.requireMock("@/features/shared/api/client") as {
  setTokenRefreshCallback: jest.Mock;
  setAuthFailureCallback: jest.Mock;
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
    const { isAuthenticated, loading, needsReloginForServer } = useAuth();
    return (
      <>
        <Text testID="authenticated">{String(isAuthenticated)}</Text>
        <Text testID="loading">{String(loading)}</Text>
        <Text testID="needsRelogin">{String(needsReloginForServer)}</Text>
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

  it("registers setTokenRefreshCallback and setAuthFailureCallback on mount", async () => {
    renderProvider();

    await waitFor(() => {
      expect(clientMock().setTokenRefreshCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
      expect(clientMock().setAuthFailureCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  it("sets needsReloginForServer=true when the onAuthFailure callback fires", async () => {
    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(clientMock().setAuthFailureCallback).toHaveBeenCalled();
    });

    const onAuthFailure = clientMock().setAuthFailureCallback.mock.calls[0][0] as () => void;
    onAuthFailure();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });
  });

  it("stays unauthenticated when no userUUID and no guest session", async () => {
    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("false");
      expect(getByTestId("loading").props.children).toBe("false");
    });
  });
});
