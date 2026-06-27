import { isAxiosError } from "axios";
import { AppError, ErrorDomain } from "./app-error";

export function toAppError(error: unknown, domain?: ErrorDomain): AppError {
  if (error instanceof AppError) return error;

  if (isAxiosError(error)) {
    const status = error.response?.status;
    const severity = status === 401 ? "high" : "medium";
    return new AppError(error.message, domain ?? "network", severity, error);
  }

  if (error instanceof Error) {
    return new AppError(error.message, domain ?? "unknown", "medium", error);
  }

  return new AppError(String(error), domain ?? "unknown", "low", error);
}
