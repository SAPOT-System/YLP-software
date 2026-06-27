import * as Sentry from "@sentry/react-native";
import { AppError } from "../app-error";
import { captureAppError } from "../sentry-capture";

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
}));

const mockCaptureException = Sentry.captureException as jest.Mock;

beforeEach(() => {
  mockCaptureException.mockClear();
});

describe("captureAppError", () => {
  it("does not call Sentry for low severity", () => {
    captureAppError(new AppError("minor", "gps", "low"));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("does not call Sentry for medium severity", () => {
    captureAppError(new AppError("recoverable", "network", "medium"));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("calls Sentry.captureException for high severity", () => {
    captureAppError(new AppError("auth failed", "auth", "high"));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("calls Sentry.captureException for critical severity", () => {
    captureAppError(new AppError("crypto broken", "crypto", "critical"));
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("sends cause as primary exception when present", () => {
    const original = new Error("root cause");
    const appErr = new AppError("wrapped", "database", "high", original);
    captureAppError(appErr);
    expect(mockCaptureException).toHaveBeenCalledWith(
      original,
      expect.objectContaining({
        tags: { domain: "database", severity: "high" },
      })
    );
  });

  it("sends AppError itself when no cause is present", () => {
    const appErr = new AppError("no cause", "sync", "high");
    captureAppError(appErr);
    expect(mockCaptureException).toHaveBeenCalledWith(
      appErr,
      expect.objectContaining({
        tags: { domain: "sync", severity: "high" },
      })
    );
  });

  it("merges extras into Sentry event", () => {
    const appErr = new AppError("with extras", "auth", "critical");
    captureAppError(appErr, { userId: "abc123" });
    expect(mockCaptureException).toHaveBeenCalledWith(
      appErr,
      expect.objectContaining({
        extra: { userId: "abc123" },
      })
    );
  });
});
