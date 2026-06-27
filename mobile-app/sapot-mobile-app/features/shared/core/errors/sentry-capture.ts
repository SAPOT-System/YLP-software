import * as Sentry from "@sentry/react-native";
import { AppError, ErrorSeverity } from "./app-error";

const SENTRY_THRESHOLD: ErrorSeverity = "high";

const SEVERITY_RANK: Record<ErrorSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export function captureAppError(
  error: AppError,
  extras?: Record<string, unknown>
): void {
  if (SEVERITY_RANK[error.severity] < SEVERITY_RANK[SENTRY_THRESHOLD]) return;

  Sentry.captureException(error.cause ?? error, {
    tags: {
      domain: error.domain,
      severity: error.severity,
    },
    extra: extras,
  });
}
