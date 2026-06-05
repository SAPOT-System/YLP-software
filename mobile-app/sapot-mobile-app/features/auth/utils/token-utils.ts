import { toAppError } from "@/features/shared/errors";
import { authUtilsLog } from "@/features/shared/utils/logger";
import { jwtDecode } from "jwt-decode";

authUtilsLog.debug("[token-utils] module loaded");

export const isTokenExpiredLocally = (token: string): boolean => {
  if (!token) return true;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 <= Date.now();
  } catch (error) {
    const appErr = toAppError(error, "auth");
    authUtilsLog.error("[isTokenExpiredLocally] decode failed", appErr);
    return true;
  }
};
