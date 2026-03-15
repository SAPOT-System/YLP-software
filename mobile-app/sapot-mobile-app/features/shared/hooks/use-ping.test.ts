import { act, renderHook } from "@testing-library/react-native";
import { pingServer } from "../api";
import { usePing } from "./use-ping";

jest.mock("../api", () => ({
  pingServer: jest.fn(),
}));

const mockedPingServer = pingServer as jest.MockedFunction<typeof pingServer>;

describe("usePing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates latency and online state when ping succeeds", async () => {
    mockedPingServer.mockResolvedValue({ success: true, latency: 42 });

    const { result } = renderHook(() => usePing());

    expect(result.current.online).toBe(false);
    expect(result.current.latency).toBeUndefined();

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(mockedPingServer).toHaveBeenCalledTimes(1);
    expect(result.current.online).toBe(true);
    expect(result.current.latency).toBe(42);
  });

  it("updates state when ping fails", async () => {
    mockedPingServer.mockResolvedValue({ success: false, latency: null });

    const { result } = renderHook(() => usePing());

    await act(async () => {
      jest.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(result.current.online).toBe(false);
    expect(result.current.latency).toBeNull();
  });

  it("clears interval on unmount", () => {
    mockedPingServer.mockResolvedValue({ success: true, latency: 1 });
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");

    const { unmount } = renderHook(() => usePing());
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
