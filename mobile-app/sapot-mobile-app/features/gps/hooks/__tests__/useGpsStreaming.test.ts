import { renderHook } from "@testing-library/react-native";
import { useAuth, useAuthContainer } from "@/features/auth";
import { useGpsPreference } from "../../context/gps-preference-context";
import { useLocationPermission } from "../useLocationPermission";
import { GpsLocationService } from "../../services/gps-location-service";
import { useGpsStreaming } from "../useGpsStreaming";

jest.mock("@/features/auth", () => ({
  useAuth: jest.fn(),
  useAuthContainer: jest.fn(),
}));

jest.mock("@/config/runtime", () => ({
  getWsUrl: () => "ws://example.test",
}));

jest.mock("../../context/gps-preference-context", () => ({
  useGpsPreference: jest.fn(),
}));

jest.mock("../useLocationPermission", () => ({
  useLocationPermission: jest.fn(),
}));

jest.mock("../../services/gps-location-service", () => {
  const start = jest.fn();
  const stop = jest.fn();
  return {
    GpsLocationService: jest.fn().mockImplementation(() => ({ start, stop })),
  };
});

const mockedUseAuth = useAuth as jest.Mock;
const mockedUseAuthContainer = useAuthContainer as jest.Mock;
const mockedUseGpsPreference = useGpsPreference as jest.Mock;
const mockedUseLocationPermission = useLocationPermission as jest.Mock;

function getServiceInstance() {
  const instances = (GpsLocationService as unknown as jest.Mock).mock.results;
  return instances[instances.length - 1].value;
}

describe("useGpsStreaming", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({
      isAuthenticated: true,
      isGuest: false,
      accessToken: "token-123",
    });
    mockedUseAuthContainer.mockReturnValue({
      sessionStore: { userId: "user-1" },
    });
    mockedUseGpsPreference.mockReturnValue({ sharingEnabled: true });
  });

  it("does not start streaming while permission is not-asked", () => {
    mockedUseLocationPermission.mockReturnValue("not-asked");

    renderHook(() => useGpsStreaming());

    const service = getServiceInstance();
    expect(service.start).not.toHaveBeenCalled();
  });

  it("does not start streaming when permission is denied", () => {
    mockedUseLocationPermission.mockReturnValue("denied");

    renderHook(() => useGpsStreaming());

    const service = getServiceInstance();
    expect(service.start).not.toHaveBeenCalled();
  });

  it("starts streaming once permission is granted", () => {
    mockedUseLocationPermission.mockReturnValue("granted");

    renderHook(() => useGpsStreaming());

    const service = getServiceInstance();
    expect(service.start).toHaveBeenCalledWith(
      "ws://example.test",
      "user-1",
      "token-123"
    );
  });

  it("returns the current permission state", () => {
    mockedUseLocationPermission.mockReturnValue("granted");

    const { result } = renderHook(() => useGpsStreaming());

    expect(result.current).toBe("granted");
  });

  it("stops streaming on unmount", () => {
    mockedUseLocationPermission.mockReturnValue("granted");

    const { unmount } = renderHook(() => useGpsStreaming());
    const service = getServiceInstance();
    unmount();

    expect(service.stop).toHaveBeenCalled();
  });
});
