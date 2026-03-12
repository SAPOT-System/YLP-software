import { getApiUrl } from "@/config/runtime";
import axios from "axios";
import { getItemAsync } from "expo-secure-store";

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiClient.interceptors.request.use(async (config) => {
  const token = await getItemAsync("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
