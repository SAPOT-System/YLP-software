import { getApiUrl } from "@/config/runtime";
import axios from "axios";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

import { apiLog } from "@/features/shared/utils/logger";
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

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) return Promise.reject(error);

      const { data } = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>(`${getApiUrl()}/auth/refresh`, { refresh_token: refreshToken });

      await setItemAsync("access_token", data.access_token);
      await setItemAsync("refresh_token", data.refresh_token);

      apiLog.info("api › token refreshed mid-session");
      processQueue(null, data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      apiLog.warn("api › mid-session token refresh failed, clearing tokens", {
        error: refreshError,
      });
      processQueue(refreshError, null);
      await deleteItemAsync("access_token");
      await deleteItemAsync("refresh_token");
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
