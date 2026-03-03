import { checkBackEndHealth } from "../connection.api";
import { apiClient } from "../client";

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