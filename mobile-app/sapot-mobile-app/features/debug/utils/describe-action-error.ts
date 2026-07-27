import { isAxiosError } from "axios";

/**
 * Turns a thrown debug-action error into a short, human-readable reason for the
 * failure toast.
 *
 * The debug panel's actions all hit QA-only endpoints that answer with the same
 * status for very different causes — `/testing/login-as` 404s both when the
 * `X-QA-Token` header is missing/wrong (`require_qa_token`) and when the fixture
 * row was never seeded (`POST /testing/seed/roles`). Only the FastAPI `detail`
 * body tells those apart, so it is surfaced rather than swallowed.
 */
export function describeActionError(error: unknown): string {
  if (isAxiosError(error)) {
    if (!error.response) return "server unreachable";

    const detail = extractDetail(error.response.data);
    return detail
      ? `HTTP ${error.response.status} — ${detail}`
      : `HTTP ${error.response.status}`;
  }

  if (error instanceof Error) return error.message;

  return String(error);
}

/** Reads FastAPI's `{"detail": ...}` envelope, which is a string for raised
 * `HTTPException`s and an array of `{msg}` objects for 422 validation errors. */
function extractDetail(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;

  const { detail } = data as { detail?: unknown };

  if (typeof detail === "string") return detail || null;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) =>
        typeof entry === "object" && entry !== null
          ? String((entry as { msg?: unknown }).msg ?? "")
          : ""
      )
      .filter(Boolean);
    return messages.length > 0 ? messages.join(", ") : null;
  }

  return null;
}
