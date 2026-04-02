import { getApiUrl } from "@/config/runtime";
import axios from "axios";
import { getItemAsync } from "expo-secure-store";

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiClient.interceptors.request.use(async (config) => {
  const accessToken = await getItemAsync("access_token");

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});
