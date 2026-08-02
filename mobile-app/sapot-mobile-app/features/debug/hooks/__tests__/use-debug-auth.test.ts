import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useUserService } from "@/features/auth/hooks/use-user-service";
import { notifyAccessTokenChanged } from "@/features/shared/core/api/client";
import { getStoredAccessToken } from "@/features/shared/core/stores/secure-config";
import { useUserStore } from "@/features/shared/hooks/use-user-store";
import { requestMainContainerReset } from "@/features/shared/main-container";
import * as Updates from "expo-updates";
import { DebugAuthService } from "../../services/debug-auth-service";
import { useDebugAuth } from "../use-debug-auth";

jest.mock("@/features/auth/hooks/use-user-service", () => ({
  useUserService: jest.fn(),
}));

jest.mock("@/features/shared/hooks/use-user-store", () => ({
  useUserStore: jest.fn(),
}));

jest.mock("@/features/shared/core/api/client", () => ({
  notifyAccessTokenChanged: jest.fn(),
}));

jest.mock("@/features/shared/core/stores/secure-config", () => ({
  getStoredAccessToken: jest.fn(),
}));

jest.mock("@/features/shared/main-container", () => ({
  requestMainContainerReset: jest.fn(),
}));

jest.mock("expo-updates", () => ({
  reloadAsync: jest.fn(),
}));

jest.mock("../../services/debug-auth-service");

const mockedUseUserService = useUserService as jest.Mock;
const mockedUseUserStore = useUserStore as jest.Mock;
const MockedDebugAuthService = DebugAuthService as jest.Mock;
const mockedReloadAsync = Updates.reloadAsync as jest.Mock;
const mockedNotifyAccessTokenChanged = notifyAccessTokenChanged as jest.Mock;
const mockedGetStoredAccessToken = getStoredAccessToken as jest.Mock;
const mockedRequestMainContainerReset = requestMainContainerReset as jest.Mock;

describe("useDebugAuth", () => {
  let serviceInstance: {
    getSnapshot: jest.Mock;
    seedTestUser: jest.Mock;
    loginAs: jest.Mock;
    seedLanUser: jest.Mock;
    setRole: jest.Mock;
    injectFakeAccessToken: jest.Mock;
    clearAccessToken: jest.Mock;
    forceLogout: jest.Mock;
    resetAuthState: jest.Mock;
  };

  const baseSnapshot = {
    userId: "peer-1",
    username: "alice",
    isGuest: false,
    isRescuer: false,
    isAdmin: false,
    hasAccessToken: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseUserService.mockReturnValue({ fake: "user-service" });
    mockedUseUserStore.mockReturnValue({ fake: "user-store" });

    serviceInstance = {
      getSnapshot: jest.fn().mockResolvedValue(baseSnapshot),
      seedTestUser: jest.fn().mockResolvedValue(undefined),
      loginAs: jest.fn().mockResolvedValue(undefined),
      seedLanUser: jest.fn().mockResolvedValue(undefined),
      setRole: jest.fn(),
      injectFakeAccessToken: jest.fn().mockResolvedValue(undefined),
      clearAccessToken: jest.fn().mockResolvedValue(undefined),
      forceLogout: jest.fn().mockResolvedValue(undefined),
      resetAuthState: jest.fn().mockResolvedValue(undefined),
    };
    MockedDebugAuthService.mockImplementation(() => serviceInstance);
    mockedReloadAsync.mockResolvedValue(undefined);
    mockedGetStoredAccessToken.mockResolvedValue("fixture-access-token");
  });

  it("loads the auth snapshot on mount", async () => {
    const { result } = renderHook(() => useDebugAuth());

    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("seedTestUser seeds then restarts the app instead of refreshing the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.seedTestUser("rescuer");
    });

    expect(serviceInstance.seedTestUser).toHaveBeenCalledWith("rescuer");
    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("seedTestUser falls back to syncing auth state and refreshing the snapshot if the restart fails", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.seedTestUser("admin");
    });

    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(mockedNotifyAccessTokenChanged).toHaveBeenCalledWith(
      "fixture-access-token"
    );
    expect(mockedRequestMainContainerReset).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("loginAs logs in as the fixture then restarts the app instead of refreshing the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.loginAs("qa_admin");
    });

    expect(serviceInstance.loginAs).toHaveBeenCalledWith("qa_admin");
    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("loginAs falls back to syncing auth state and refreshing the snapshot if the restart fails", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.loginAs("qa_admin");
    });

    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(mockedNotifyAccessTokenChanged).toHaveBeenCalledWith(
      "fixture-access-token"
    );
    expect(mockedRequestMainContainerReset).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("loginAs falls back to clearing auth state when the fixture is a guest with no stored token", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    mockedGetStoredAccessToken.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.loginAs("qa_guest");
    });

    expect(mockedNotifyAccessTokenChanged).toHaveBeenCalledWith(null);
    expect(mockedRequestMainContainerReset).toHaveBeenCalledTimes(1);
  });

  it("seedLanUser seeds a guest user then restarts the app", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.seedLanUser();
    });

    expect(serviceInstance.seedLanUser).toHaveBeenCalledTimes(1);
    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("seedLanUser falls back to syncing auth state and refreshing the snapshot if the restart fails", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.seedLanUser();
    });

    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(mockedNotifyAccessTokenChanged).toHaveBeenCalledWith(
      "fixture-access-token"
    );
    expect(mockedRequestMainContainerReset).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("setRole switches role then refreshes the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.setRole("admin");
    });

    expect(serviceInstance.setRole).toHaveBeenCalledWith("admin");
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("injectFakeAccessToken injects then refreshes the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.injectFakeAccessToken();
    });

    expect(serviceInstance.injectFakeAccessToken).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("clearAccessToken clears then refreshes the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.clearAccessToken();
    });

    expect(serviceInstance.clearAccessToken).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("forceLogout logs out then restarts the app instead of refreshing the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.forceLogout();
    });

    expect(serviceInstance.forceLogout).toHaveBeenCalledTimes(1);
    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("forceLogout falls back to refreshing the snapshot if the restart fails", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.forceLogout();
    });

    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });

  it("resetAuthState resets then restarts the app instead of refreshing the snapshot", async () => {
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.resetAuthState();
    });

    expect(serviceInstance.resetAuthState).toHaveBeenCalledTimes(1);
    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("resetAuthState falls back to refreshing the snapshot if the restart fails", async () => {
    mockedReloadAsync.mockRejectedValue(new Error("reload unsupported"));
    const { result } = renderHook(() => useDebugAuth());
    await waitFor(() => expect(result.current.snapshot).toEqual(baseSnapshot));

    await act(async () => {
      await result.current.resetAuthState();
    });

    expect(mockedReloadAsync).toHaveBeenCalledTimes(1);
    expect(serviceInstance.getSnapshot).toHaveBeenCalledTimes(2);
  });
});
