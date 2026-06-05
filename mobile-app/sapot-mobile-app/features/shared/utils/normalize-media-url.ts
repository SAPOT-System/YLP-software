import { toAppError } from "@/features/shared/errors";
import { getApiUrl } from "@/config/runtime";
import { utilLog } from "./logger";
utilLog.debug("[normalize-media-url] module loaded");

export const normalizeMediaUrl = (url?: string | null) => {
  utilLog.debug("[normalizeMediaUrl] called", { hasUrl: Boolean(url) });
  if (!url) return null;

  try {
    const baseUrl = new URL(getApiUrl());
    const parsedUrl = new URL(url, baseUrl.toString());

    if (
      parsedUrl.hostname === "0.0.0.0" ||
      parsedUrl.hostname === "localhost"
    ) {
      parsedUrl.protocol = baseUrl.protocol;
      parsedUrl.host = baseUrl.host;
    }

    return parsedUrl.toString();
  } catch (error) {
    const appErr = toAppError(error, "unknown");
    utilLog.warn("[normalizeMediaUrl] failed", appErr);
    return url ?? null;
  }
};
