import { getGsmErrorMessage, getGsmFailure } from "../gsm-error";

describe("GSM gateway errors", () => {
  it("recognizes a queue saturation response", () => {
    const error = {
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

    expect(getGsmFailure(error)).toEqual({
      status: 503,
      reason: "QUEUE_FULL",
      message: "Outbound SMS queue is full",
      messageId: "sms-log-id",
    });
    expect(getGsmErrorMessage(error, "fallback")).toBe(
      "SMS service is busy. Please try again shortly."
    );
  });

  it("recognizes a service shutdown response", () => {
    const error = {
      response: {
        status: 503,
        data: {
          detail: {
            message: "SMS service is stopping",
            reason: "SERVICE_STOPPING",
            msg_id: "sms-log-id",
          },
        },
      },
    };

    expect(getGsmErrorMessage(error, "fallback")).toBe(
      "SMS service is restarting. Please try again shortly."
    );
  });

  it("recognizes an unavailable modem response", () => {
    const error = {
      response: {
        status: 503,
        data: { detail: "GSM modem not ready" },
      },
    };

    expect(getGsmFailure(error)).toEqual({
      status: 503,
      reason: "GATEWAY_UNAVAILABLE",
      message: "GSM modem not ready",
    });
    expect(getGsmErrorMessage(error, "fallback")).toBe(
      "SMS service is unavailable. Please try again later."
    );
  });

  it("uses the supplied fallback for unrelated errors", () => {
    expect(getGsmFailure(new Error("network failed"))).toBeUndefined();
    expect(getGsmErrorMessage(new Error("network failed"), "fallback")).toBe(
      "fallback"
    );
  });
});
