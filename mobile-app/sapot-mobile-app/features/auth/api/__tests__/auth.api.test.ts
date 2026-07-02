import { resetPasswordApi } from "../auth.api";

jest.mock("@/features/shared", () => ({
  apiClient: { post: jest.fn(), get: jest.fn() },
}));

import { apiClient } from "@/features/shared";

const mockPost = apiClient.post as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ status: 200, data: { message: "ok" } });
});

describe("resetPasswordApi", () => {
  it("includes recovery_token in body when provided", async () => {
    await resetPasswordApi("reset-tok", "NewPass1!", "blob123", "rec-tok");
    expect(mockPost).toHaveBeenCalledWith(
      "/auth/forgot-password/reset-password",
      expect.objectContaining({ recovery_token: "rec-tok" }),
      expect.objectContaining({ params: { token: "reset-tok" } })
    );
  });

  it("sends recovery_token as null when omitted", async () => {
    await resetPasswordApi("reset-tok", "NewPass1!");
    expect(mockPost).toHaveBeenCalledWith(
      "/auth/forgot-password/reset-password",
      expect.objectContaining({ recovery_token: null }),
      expect.anything()
    );
  });
});
