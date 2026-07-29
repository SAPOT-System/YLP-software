import { checkTileServerReachable } from "../tileserver.api";

jest.mock("@/config/runtime", () => ({
  getTileServerUrl: jest.fn(() => "https://server.test/tiles"),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

describe("checkTileServerReachable", () => {
  it("probes the basemap style served by the tileserver", async () => {
    // Arrange / Act
    await checkTileServerReachable();

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(
      "https://server.test/tiles/styles/basic-preview/style.json",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns true when the tileserver answers with a 2xx", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await expect(checkTileServerReachable()).resolves.toBe(true);
  });

  it("returns false when the tileserver answers with an error status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });

    await expect(checkTileServerReachable()).resolves.toBe(false);
  });

  it("returns false instead of throwing when the request fails outright", async () => {
    mockFetch.mockRejectedValue(new Error("Network request failed"));

    await expect(checkTileServerReachable()).resolves.toBe(false);
  });

  it("aborts the probe rather than hanging when the tileserver never answers", async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(new Error("Aborted"))
          );
        })
    );

    const pending = checkTileServerReachable();
    jest.advanceTimersByTime(10_000);

    await expect(pending).resolves.toBe(false);
    jest.useRealTimers();
  });
});
