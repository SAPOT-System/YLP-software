import { createTestPingResponse } from "@/test/factories/api-response.factory";
import { apiClient } from "../client";
import { checkBackEndHealth, pingServer } from "../connection.api";

jest.mock("../client", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe("checkBackEndHealth", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return true when API is healthy", async () => {
    mockedApiClient.get.mockResolvedValue({ status: 200 });

    const result = await checkBackEndHealth();

    expect(result).toBe(true);
    expect(mockedApiClient.get).toHaveBeenCalledWith("/");
  });

  it("should return false when API request fails", async () => {
    mockedApiClient.get.mockRejectedValue(new Error("Network error"));

    const result = await checkBackEndHealth();

    expect(result).toBe(false);
    expect(mockedApiClient.get).toHaveBeenCalledWith("/");
  });

  it("should return false when API throws any error", async () => {
    mockedApiClient.get.mockRejectedValue(new Error("500 Server Error"));

    const result = await checkBackEndHealth();

    expect(result).toBe(false);
  });
});

describe("pingServer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns success true with computed latency from server timestamp", async () => {
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1088);
    mockedApiClient.get.mockResolvedValue(
      createTestPingResponse({
        data: {
          status: "ok",
          timestamp: 1000,
        },
      })
    );

    const result = await pingServer();

    expect(mockedApiClient.get).toHaveBeenCalledWith("/ping");
    expect(result).toEqual({ success: true, latency: 88 });
    nowSpy.mockRestore();
  });

  it("returns success false when request fails", async () => {
    mockedApiClient.get.mockRejectedValue(new Error("network error"));

    const result = await pingServer();

    expect(result).toEqual({ success: false, latency: null });
  });
});