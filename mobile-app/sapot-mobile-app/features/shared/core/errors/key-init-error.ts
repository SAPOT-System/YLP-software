import { AppError, ErrorSeverity } from "./app-error";

/**
 * Distinguishable reasons the post-login key load can fail.
 *
 * Every one of these used to collapse into a single "Something went wrong
 * loading your encryption keys" message, which made the intermittent failure
 * impossible to identify from a bug report. Codes are safe to log and to show
 * in the UI — they name the failing step only, never key material.
 */
export type KeyInitErrorCode =
  /** Container was built before the auth state finished settling. */
  | "AUTH_STATE_NOT_READY"
  /** A cached key exists but could not be read back or decoded. */
  | "SECURE_STORE_READ_FAILED"
  /** Authenticated user with neither a cached bundle nor a password in memory. */
  | "MASTER_KEY_UNAVAILABLE"
  /** Server blob fetched but the password-derived key did not open it. */
  | "MASTER_KEY_UNWRAP_FAILED"
  /** The wrapped-key endpoint could not be reached. */
  | "KEY_SERVER_UNREACHABLE"
  /** ECDH signaling keypair could not be established. */
  | "PEER_KEY_INIT_FAILED"
  /** Contact public keys could not be fetched or decrypted. */
  | "CONTACT_KEY_SYNC_FAILED"
  /** Guest device keypair could not be established. */
  | "GUEST_KEY_INIT_FAILED"
  | "UNKNOWN";

interface KeyInitErrorOptions {
  cause?: unknown;
  /** Extra non-sensitive context, e.g. "cache-partial". */
  detail?: string;
  severity?: ErrorSeverity;
}

/**
 * A key-loading failure carrying the step that failed, so the UI and logs can
 * tell a secure-store read failure apart from an absent master key or an
 * auth-state race.
 */
export class KeyInitError extends AppError {
  readonly code: KeyInitErrorCode;
  readonly detail?: string;

  constructor(
    message: string,
    code: KeyInitErrorCode,
    options: KeyInitErrorOptions = {}
  ) {
    super(message, "crypto", options.severity ?? "high", options.cause);
    this.name = "KeyInitError";
    this.code = code;
    this.detail = options.detail;
  }
}

/**
 * Normalises an unknown throwable into a `KeyInitError`, preserving the code of
 * an error that was already classified further down the stack.
 */
export function toKeyInitError(
  error: unknown,
  fallbackCode: KeyInitErrorCode = "UNKNOWN"
): KeyInitError {
  if (error instanceof KeyInitError) return error;

  const message = error instanceof Error ? error.message : String(error);
  return new KeyInitError(message, fallbackCode, { cause: error });
}
