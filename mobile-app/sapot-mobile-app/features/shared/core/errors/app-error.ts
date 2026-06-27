export type ErrorDomain =
  | "network"
  | "auth"
  | "database"
  | "crypto"
  | "media"
  | "gps"
  | "signaling"
  | "sync"
  | "unknown";

export type ErrorSeverity = "low" | "medium" | "high" | "critical";

export class AppError extends Error {
  readonly domain: ErrorDomain;
  readonly severity: ErrorSeverity;
  readonly cause?: unknown;

  constructor(
    message: string,
    domain: ErrorDomain,
    severity: ErrorSeverity,
    cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
    this.domain = domain;
    this.severity = severity;
    this.cause = cause;
    // Fix prototype chain for instanceof checks in transpiled code
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
