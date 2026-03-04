import axios from "axios";
import { getApiUrl } from "@/config/runtime";
import { tokenService } from "@/features/auth/service/token-service";

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiClient.interceptors.request.use(
  async config => {

    const token =
      tokenService.getAccessToken();

    if (token) {
      config.headers.Authorization =
        `Bearer ${token}`;
    }

    return config;
  }
);