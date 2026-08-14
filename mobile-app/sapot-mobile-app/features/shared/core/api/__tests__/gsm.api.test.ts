import { GsmGatewayError } from "../../errors/gsm-error";
import { apiClient } from "../client";
import { contactUnknownUser, sendSmsToUser } from "../gsm.api";

jest.mock("../client", () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

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

describe("GSM API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("wraps send saturation as a typed GSM gateway error", async () => {
    mockedApiClient.post.mockRejectedValue(queueFullError);

    await expect(sendSmsToUser("user-id", "message")).rejects.toMatchObject({
      name: "GsmGatewayError",
      status: 503,
      reason: "QUEUE_FULL",
      messageId: "sms-log-id",
    } satisfies Partial<GsmGatewayError>);
  });

  it("wraps first-contact saturation as a typed GSM gateway error", async () => {
    mockedApiClient.post.mockRejectedValue(queueFullError);

    await expect(contactUnknownUser("+639171234567")).rejects.toMatchObject({
      name: "GsmGatewayError",
      status: 503,
      reason: "QUEUE_FULL",
    } satisfies Partial<GsmGatewayError>);
  });
});
