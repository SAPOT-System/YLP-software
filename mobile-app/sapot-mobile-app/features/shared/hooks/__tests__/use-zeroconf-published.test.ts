/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAppMode } from "@/features/shared/core/context";
import { renderHook } from "@testing-library/react-native";
import { useDiscoveryService } from "../use-discovery-service";
import { useZeroconfPublished } from "../use-zeroconf-published";

jest.mock("../use-discovery-service");
jest.mock("@/features/shared/core/context");

describe("useZeroconfPublished", () => {
  let mockDiscoveryService: any;
  let mockAppModeStore: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDiscoveryService = {
      isPublished: jest.fn(() => true),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      subscribeToPublished: jest.fn((listener: () => void) => {
        return () => {};
      }),
    };

    mockAppModeStore = {
      isZeroconfAllowed: jest.fn(() => true),
    };

    (useDiscoveryService as jest.Mock).mockReturnValue(mockDiscoveryService);
    (useAppMode as jest.Mock).mockReturnValue({ store: mockAppModeStore });
  });

  it("returns isPublished state from discovery service", () => {
    const { result } = renderHook(() => useZeroconfPublished());

    expect(result.current.isPublished).toBe(true);
    expect(mockDiscoveryService.isPublished).toHaveBeenCalled();
  });

  it("returns isZeroconfAllowed from app mode store", () => {
    const { result } = renderHook(() => useZeroconfPublished());

    expect(result.current.isZeroconfAllowed).toBe(true);
    expect(mockAppModeStore.isZeroconfAllowed).toHaveBeenCalledWith(false);
  });

  it("subscribes to published state changes", () => {
    renderHook(() => useZeroconfPublished());

    expect(mockDiscoveryService.subscribeToPublished).toHaveBeenCalled();
  });

  it("unsubscribes from published state on unmount", () => {
    const unsubscribeMock = jest.fn();
    mockDiscoveryService.subscribeToPublished.mockReturnValue(
      unsubscribeMock
    );

    const { unmount } = renderHook(() => useZeroconfPublished());

    unmount();

    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
