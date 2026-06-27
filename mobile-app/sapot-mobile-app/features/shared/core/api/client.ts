import { getApiUrl } from "@/config/runtime";
import axios from "axios";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

import { apiLog } from "@/features/shared/core/utils/logger";
apiLog.debug("[api-client] module loaded");

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiLog.info("api › client created", {
  hasBaseUrl: Boolean(apiClient.defaults.baseURL),
});

// Callbacks registered by AuthProvider to keep React state in sync
let onTokenRefreshed: ((token: string) => void) | null = null;
let onNeedsRelogin: (() => void) | null = null;

export const setTokenRefreshCallback = (cb: (token: string) => void) => {
  onTokenRefreshed = cb;
};

export const setNeedsReloginCallback = (cb: () => void) => {
  onNeedsRelogin = cb;
};

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

    // Not a 401, or no server response (network error on original request), or already retried
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

      onTokenRefreshed?.(data.access_token);

      apiLog.info("api › token refreshed mid-session");
      processQueue(null, data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      const isServerRejection =
        (refreshError as { response?: { status: number } })?.response
          ?.status === 401;

      if (isServerRejection) {
        apiLog.warn("api › server explicitly rejected refresh token, signaling relogin");
        await deleteItemAsync("access_token");
        await deleteItemAsync("refresh_token");
        onNeedsRelogin?.();
      } else {
        apiLog.warn("api › refresh failed (network error), keeping tokens for offline use");
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
