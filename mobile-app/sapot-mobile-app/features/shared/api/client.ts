import { getApiUrl } from "@/config/runtime";
import baseLogger from "@/features/shared/utils/logger";
import axios from "axios";
import { getItemAsync } from "expo-secure-store";

const apiLog = baseLogger.extend("api");
apiLog.debug("[api-client] module loaded");

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiLog.info("api › client created", {
  hasBaseUrl: Boolean(apiClient.defaults.baseURL),
});

apiClient.interceptors.request.use(async (config) => {
  const accessToken = await getItemAsync("access_token");

  apiLog.debug("api › request", {
    method: config.method,
    url: config.url,
    hasAccessToken: Boolean(accessToken),
  });

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});
