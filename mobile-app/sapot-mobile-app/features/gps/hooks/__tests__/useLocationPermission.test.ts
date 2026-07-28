import { renderHook, waitFor } from "@testing-library/react-native";
import * as Location from "expo-location";
import { useLocationPermission } from "../useLocationPermission";

jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
}));

const mockedRequestForegroundPermissionsAsync =
  Location.requestForegroundPermissionsAsync as jest.Mock;

describe("useLocationPermission", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts in the not-asked state before the permission request resolves", () => {
    mockedRequestForegroundPermissionsAsync.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useLocationPermission());

    expect(result.current).toBe("not-asked");
  });

  it("resolves to granted when the OS grants foreground permission", async () => {
    mockedRequestForegroundPermissionsAsync.mockResolvedValue({
      status: "granted",
    });

    const { result } = renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current).toBe("granted"));
  });

  it("resolves to denied when the OS denies foreground permission", async () => {
    mockedRequestForegroundPermissionsAsync.mockResolvedValue({
      status: "denied",
    });

    const { result } = renderHook(() => useLocationPermission());

    await waitFor(() => expect(result.current).toBe("denied"));
  });

  it("does not update state after unmount", async () => {
    let resolvePermission: (value: { status: string }) => void;
    mockedRequestForegroundPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        resolvePermission = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useLocationPermission());
    unmount();
    resolvePermission!({ status: "granted" });

    await Promise.resolve();
    expect(result.current).toBe("not-asked");
  });
});
