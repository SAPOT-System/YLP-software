import baseLogger from "@/features/shared/utils/logger";
import { jwtDecode } from "jwt-decode";

const utilsLog = baseLogger.extend("auth-utils");
utilsLog.debug("[token-utils] module loaded");

export const isAccessTokenValid = async (token: string) => {
  utilsLog.debug("[isAccessTokenValid] called", {
    hasToken: Boolean(token),
  });
  if (!token) return false;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 > Date.now();
  } catch (error) {
    utilsLog.error("[isAccessTokenValid] decode failed", { error });
    return false;
  }
};
