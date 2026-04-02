import { getApiUrl } from "@/config/runtime";

export const normalizeMediaUrl = (url?: string | null) => {
  if (!url) return null;

  try {
    // eslint-disable-next-line no-undef
    const baseUrl = new URL(getApiUrl());
    // eslint-disable-next-line no-undef
    const parsedUrl = new URL(url, baseUrl.toString());

    if (parsedUrl.hostname === "0.0.0.0" || parsedUrl.hostname === "localhost") {
      parsedUrl.protocol = baseUrl.protocol;
      parsedUrl.host = baseUrl.host;
    }

    return parsedUrl.toString();
  } catch {
    return url ?? null;
  }
};
