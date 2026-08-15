import { GsmGatewayError } from "@/features/shared/core/errors/gsm-error";
import {
  loginAsFixtureApi,
  requestPhoneVerification,
  resendVerificationCodePhone,
  resetPasswordApi,
} from "../auth.api";

jest.mock("@/features/shared", () => ({
  apiClient: { post: jest.fn(), get: jest.fn() },
}));

jest.mock("@/config/debug", () => ({
  QA_API_TOKEN: "test-qa-token",
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

describe("loginAsFixtureApi", () => {
  it("posts to /testing/login-as/{handle} with the X-QA-Token header", async () => {
    await loginAsFixtureApi("qa_admin");
    expect(mockPost).toHaveBeenCalledWith(
      "/testing/login-as/qa_admin",
      null,
      { headers: { "X-QA-Token": "test-qa-token" } }
    );
  });

  it("URL-encodes the handle", async () => {
    await loginAsFixtureApi("qa/../admin");
    expect(mockPost).toHaveBeenCalledWith(
      "/testing/login-as/qa%2F..%2Fadmin",
      null,
      expect.anything()
    );
  });
});

describe("GSM verification API", () => {
  const queueFullError = {
    response: {
      status: 503,
      data: {
        detail: {
          message: "Outbound SMS queue is full",
          reason: "QUEUE_FULL",
          msg_id: "sms-log-id",
        },
      },
    },
  };

  it("wraps verification saturation as a typed GSM gateway error", async () => {
    mockPost.mockRejectedValue(queueFullError);

    await expect(
      requestPhoneVerification("+639171234567")
    ).rejects.toMatchObject({
      name: "GsmGatewayError",
      status: 503,
      reason: "QUEUE_FULL",
    } satisfies Partial<GsmGatewayError>);
  });

  it("wraps resend saturation as a typed GSM gateway error", async () => {
    mockPost.mockRejectedValue(queueFullError);

    await expect(resendVerificationCodePhone()).rejects.toMatchObject({
      name: "GsmGatewayError",
      status: 503,
      reason: "QUEUE_FULL",
    } satisfies Partial<GsmGatewayError>);
  });
});
