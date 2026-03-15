import { createTestUserProfileResponse } from "@/test/factories/api-response.factory";
import { apiClient } from "../client";
import { getUserApi } from "../user-profile.api";

jest.mock("../client", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe("getUserApi", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls user profile endpoint with auth header", async () => {
    const response = createTestUserProfileResponse();
    mockedApiClient.get.mockResolvedValue(response);

    const result = await getUserApi("token-123");

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      "/user-utils/current-user-info/",
      {
        headers: {
          Authorization: "Bearer token-123",
        },
      }
    );
    expect(result).toEqual(response.data);
  });

  it("calls user profile endpoint without auth header when token is missing", async () => {
    mockedApiClient.get.mockResolvedValue({ data: { id: "user-2" } });

    await getUserApi();

    expect(mockedApiClient.get).toHaveBeenCalledWith(
      "/user-utils/current-user-info/",
      { headers: {} }
    );
  });

  it("throws when api request fails", async () => {
    mockedApiClient.get.mockRejectedValue(new Error("network failed"));

    await expect(getUserApi("token-123")).rejects.toThrow("network failed");
  });
});
