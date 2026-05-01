import { authUtilsLog } from "@/features/shared/utils/logger";
import { jwtDecode } from "jwt-decode";
authUtilsLog.debug("[token-utils] module loaded");

export const isAccessTokenValid = async (token: string) => {
  authUtilsLog.debug("[isAccessTokenValid] called", {
    hasToken: Boolean(token),
  });
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 > Date.now();
  } catch (error) {
    authUtilsLog.error("[isAccessTokenValid] decode failed", { error });
    return false;
  }
};

export const isRefreshTokenValid = async (token: string) => {
  authUtilsLog.debug("[isRefreshTokenValid] called", {
    hasToken: Boolean(token),
  });
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 > Date.now();
  } catch (error) {
    authUtilsLog.error("[isRefreshTokenValid] decode failed", { error });
    return false;
  }
};
