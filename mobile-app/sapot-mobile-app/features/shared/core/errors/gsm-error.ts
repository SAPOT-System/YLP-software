import { AppError } from "./app-error";
import { toAppError } from "./to-app-error";

export interface GsmFailure {
  status: number;
  reason: string;
  message: string;
  messageId?: string;
}

export class GsmGatewayError extends AppError {
  readonly status: number;
  readonly reason: string;
  readonly messageId?: string;

  constructor(failure: GsmFailure, cause?: unknown) {
    super(failure.message, "network", "medium", cause);
    this.name = "GsmGatewayError";
    this.status = failure.status;
    this.reason = failure.reason;
    this.messageId = failure.messageId;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function getGsmFailure(error: unknown): GsmFailure | undefined {
  if (error instanceof GsmGatewayError) {
    return {
      status: error.status,
      reason: error.reason,
      message: error.message,
      messageId: error.messageId,
    };
  }

  const response = asRecord(asRecord(error)?.response);
  const status = response?.status;
  const data = asRecord(response?.data);
  const detail = data?.detail;
  const detailRecord = asRecord(detail);

  if (typeof status !== "number") return undefined;

  if (detailRecord) {
    const reason = detailRecord.reason;
    const message = detailRecord.message;
    const messageId = detailRecord.msg_id;
    if (typeof reason !== "string" || typeof message !== "string") {
      return undefined;
    }
    return {
      status,
      reason,
      message,
      messageId: typeof messageId === "string" ? messageId : undefined,
    };
  }

  if (status === 503 && typeof detail === "string") {
    return {
      status,
      reason: "GATEWAY_UNAVAILABLE",
      message: detail,
    };
  }

  return undefined;
}

export function toGsmGatewayError(error: unknown): AppError {
  const failure = getGsmFailure(error);
  return failure
    ? new GsmGatewayError(failure, error)
    : toAppError(error, "network");
}

export function getGsmErrorMessage(error: unknown, fallback: string): string {
  const failure = getGsmFailure(error);
  if (!failure) return fallback;

  if (failure.reason === "QUEUE_FULL") {
    return "SMS service is busy. Please try again shortly.";
  }
  if (failure.reason === "SERVICE_STOPPING") {
    return "SMS service is restarting. Please try again shortly.";
  }
  if (failure.status === 503) {
    return "SMS service is unavailable. Please try again later.";
  }
  return fallback;
}
