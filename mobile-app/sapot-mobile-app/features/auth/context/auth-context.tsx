import { getUserApi } from "@/features/shared";
import {
  setNeedsReloginCallback,
  setTokenRefreshCallback,
} from "@/features/shared/api/client";
import { requestMainContainerReset } from "@/features/shared/main-container";
import { authLog } from "@/features/shared/utils/logger";
import { isTokenExpiredLocally } from "@/features/auth/utils/token-utils";
import { AxiosError } from "axios";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  register as registerApi,
  loginApi,
  logoutApi,
  refreshTokenApi,
  fetchChallengeApi,
} from "../api";
import {
  buildDeviceFields,
  clearDeviceSigningKey,
} from "@/features/shared/services/device-key-service";
import { useAuthContainer } from "../hooks";
import { useUserService } from "../hooks/use-user-service";
import {
  LoginApiErrorResponse,
  LoginApiRequest,
  RegisterApiRequest,
  RegisterApiResponse,
} from "../types";
import {
  generateGuestUsername,
  hasValidationErrors,
  validateGuestLoginForm,
} from "../utils/";
import {
  clearConnectionConfig,
  saveLockoutInfo,
  clearLockoutInfo,
  getLockoutInfo,
} from "@/features/shared/stores/secure-config";

export interface LoginLockout {
  lockedUntil: string;
  deviceType: string;
  attemptsRemaining: number;
}

interface AuthContextI {
  login: (credentials: LoginApiRequest) => Promise<{ success: boolean; lockout?: LoginLockout; attemptsRemaining?: number }>;
  loginAsGuest: (credentials: {
    firstName: string;
    lastName: string;
  }) => Promise<{ success: boolean }>;
  loginAfterRegister: (data: RegisterApiResponse) => Promise<void>;
  registerAndMigrate: (
    data: RegisterApiRequest
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logoutAsGuest: () => Promise<void>;
  loading: boolean;
  isBootstrapping: boolean;
  errors: LoginFormErrors;
  isAuthenticated: boolean;
  accessToken: string | null;
  isGuest: boolean;
  isRescuer: boolean;
  isAdmin: boolean;
  needsReloginForServer: boolean;
  isOfflineWithExpiredToken: boolean;
  transitionReloginToOffline: () => void;
  transitionOfflineToRelogin: () => void;
}

const AuthContext = createContext<AuthContextI | null>(null);

interface DeviceLockoutResponse {
  locked_until: string;
  device_type: string;
  attempts_remaining: number;
}

interface LoginFormErrors extends GuestLoginFormErrors {
  username?: string;
  password?: string;
  general?: string;
}

interface GuestLoginFormErrors {
  firstName?: string;
  lastName?: string;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isRescuer, setIsRescuer] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsReloginForServer, setNeedsReloginForServer] = useState(false);
  const [isOfflineWithExpiredToken, setIsOfflineWithExpiredToken] =
    useState(false);
  const userService = useUserService();
  const { guestUserRepository, guestMigrationService, peerService } =
    useAuthContainer();

  useEffect(() => {
    setTokenRefreshCallback((token) => setAccessToken(token));
    setNeedsReloginCallback(() => setNeedsReloginForServer(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshSession = useCallback(
    async (
      opts: {
        keepSessionOnRejection?: boolean;
        tokenWasExpired?: boolean;
      } = {}
    ) => {
      try {
        authLog.debug("[AuthProvider] refreshSession called");
        const refreshToken = await getItemAsync("refresh_token");
        if (!refreshToken) {
          authLog.warn("[AuthProvider] missing refresh token");
          if (opts.keepSessionOnRejection) {
            setNeedsReloginForServer(true);
          }
          return false;
        }

        const { access_token, refresh_token } = await refreshTokenApi(
          refreshToken
        );
        await setItemAsync("access_token", access_token);
        await setItemAsync("refresh_token", refresh_token);

        const userInfo = await getUserApi(access_token);
        await userService.syncAuthenticatedUser(userInfo);
        setIsRescuer(userService.getIsRescuer());
        setIsAdmin(userService.getIsAdmin());
        setAccessToken(access_token);
        setIsAuthenticated(true);
        authLog.debug("setIsOfflineWithExpiredToken false");
        setIsOfflineWithExpiredToken(false);
        return true;
      } catch (err) {
        authLog.warn("auth › refresh session failed", { error: err });

        const isServerRejection =
          (err as { response?: { status: number } })?.response?.status === 401;

        if (isServerRejection) {
          if (opts.keepSessionOnRejection) {
            authLog.warn(
              "auth › server rejected refresh token, surfacing relogin banner"
            );
            setNeedsReloginForServer(true);
            return false;
          }
          authLog.warn("auth › server rejected refresh token, logging out");
          await deleteItemAsync("access_token");
          await deleteItemAsync("refresh_token");
          await deleteItemAsync("userUUID");
          await userService.logout();
          await clearConnectionConfig();
          setAccessToken(null);
          setIsAuthenticated(false);
          setIsRescuer(false);
          setIsAdmin(false);
          return false;
        }

        // Network error: restore from local data for offline use
        const uuid = await getItemAsync("userUUID");
        if (uuid) {
          const userInfo = await peerService.findPeerById(uuid);
          if (!userInfo) return false;

          await userService.syncAuthenticatedUser({
            id: userInfo.id,
            username: userInfo.username,
            first_name: userInfo.firstName,
            last_name: userInfo.lastName,
            email: userInfo.email,
            phone_number: userInfo.phoneNumber,
            email_verified: userInfo.emailVerified,
          });
          if (opts.tokenWasExpired) {
            authLog.warn(
              "auth › server unreachable with expired token, warning user not to logout"
            );
            setIsOfflineWithExpiredToken(true);
          }
          setIsAuthenticated(true);
          return true;
        }
        return false;
      }
    },
    [userService, peerService]
  );

  useEffect(() => {
    (async () => {
      authLog.debug("auth › bootstrap start");
      setLoading(true);
      try {
        const uuid = await getItemAsync("userUUID");

        if (uuid) {
          let hasLocalRecord = false;
          try {
            await userService.initialize({ isGuest: false });
            userService.getUser();
            hasLocalRecord = true;
          } catch {
            hasLocalRecord = false;
          }

          if (hasLocalRecord) {
            setIsRescuer(userService.getIsRescuer());
            setIsAdmin(userService.getIsAdmin());
            const storedToken = await getItemAsync("access_token");
            if (storedToken) setAccessToken(storedToken);
            setIsAuthenticated(true);
            setLoading(false);

            const tokenWasExpired =
              !storedToken || isTokenExpiredLocally(storedToken);
            if (tokenWasExpired) {
              refreshSession({
                keepSessionOnRejection: true,
                tokenWasExpired: true,
              }).catch(() => {});
            }
            return;
          }

          authLog.warn(
            "[AuthProvider] no local record, attempting server refresh"
          );
          await refreshSession();
        } else if (await userService.isCurrentUserGuest()) {
          authLog.info("[AuthProvider] restoring guest session");
          await userService.initialize({ isGuest: true });
          setIsGuest(true);
        }
      } catch (err) {
        authLog.error("auth › bootstrap failed", { error: err });
      } finally {
        setLoading(false);
        setIsBootstrapping(false);
      }
    })();
  }, [refreshSession, userService]);

  const login = async (credentials: LoginApiRequest) => {
    authLog.debug("[AuthProvider] login called", {
      hasUsername: Boolean(credentials.username?.trim()),
      password: "[REDACTED]",
    });
    setLoading(true);
    setErrors({});

    const validationErrors: LoginFormErrors = {};
    if (!credentials.username.trim()) {
      validationErrors.username = "Username is required";
    }
    if (!credentials.password.trim()) {
      validationErrors.password = "Password is required";
    }
    if (Object.keys(validationErrors).length > 0) {
      authLog.warn("[AuthProvider] login validation failed");
      setErrors(validationErrors);
      setLoading(false);
      return { success: false };
    }

    const existingLockout = await getLockoutInfo("lockout_login");
    if (existingLockout) {
      const until = new Date(existingLockout.lockedUntil);
      if (until > new Date()) {
        authLog.warn("auth › login blocked by active lockout", { lockedUntil: existingLockout.lockedUntil, deviceType: existingLockout.deviceType });
        setErrors({ general: "Too many attempts. Please wait before trying again." });
        setLoading(false);
        return { success: false };
      }
      await clearLockoutInfo("lockout_login");
    }

    const deviceFields = await buildDeviceFields(fetchChallengeApi);
    authLog.debug("auth › device gate", { hasDeviceFields: Boolean(deviceFields) });

    const isRelogin = needsReloginForServer;

    try {
      const res = await loginApi(credentials, deviceFields);
      setLoading(false);

      if (isRelogin) {
        authLog.info(
          "[AuthProvider] relogin succeeded — wiping local DB for fresh session"
        );
        await userService.wipeDatabase();
      }

      const { access_token, refresh_token } = res.data;
      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      const userInfo = await getUserApi(access_token);
      const { setPendingPassword } = await import(
        "@/features/shared/main-container"
      );
      setPendingPassword(credentials.password);

      await userService.syncAuthenticatedUser(userInfo);
      setAccessToken(access_token);
      setIsAuthenticated(true);
      setNeedsReloginForServer(false);
      setIsOfflineWithExpiredToken(false);
      setIsRescuer(userService.getIsRescuer());
      setIsAdmin(userService.getIsAdmin());

      if (isRelogin) {
        requestMainContainerReset();
      }

      await clearLockoutInfo("lockout_login");
      clearDeviceSigningKey();
      return { success: true };
    } catch (err) {
      authLog.error("auth › login failed", { error: err });
      setLoading(false);

      const axiosError = err as AxiosError<LoginApiErrorResponse>;
      if (!axiosError.response) return { success: false };

      const status = axiosError.response.status;
      const data = axiosError.response.data;
      authLog.warn("auth › login error response", {
        status,
        hasData: Boolean(data),
      });

      if (status === 401) {
        const detail = data.detail;
        const message = typeof detail === 'string' ? detail : detail.message;
        const attemptsRemaining =
          typeof detail === 'object' && detail.attempts_remaining != null
            ? detail.attempts_remaining
            : undefined;
        setErrors({ general: message });
        return { success: false, attemptsRemaining };
      }

      if (status === 429) {
        const lockoutData = (data as unknown as { detail: DeviceLockoutResponse }).detail;
        authLog.warn("auth › login device lockout", { deviceType: lockoutData.device_type, lockedUntil: lockoutData.locked_until });
        await saveLockoutInfo(
          "lockout_login",
          lockoutData.locked_until,
          lockoutData.device_type,
          lockoutData.attempts_remaining
        );
        setErrors({ general: "Too many attempts. Your device is temporarily locked." });
        return {
          success: false,
          lockout: {
            lockedUntil: lockoutData.locked_until,
            deviceType: lockoutData.device_type,
            attemptsRemaining: lockoutData.attempts_remaining,
          },
        };
      }

      setErrors({ general: "An unexpected error occurred." });
      return { success: false };
    }
  };

  const loginAfterRegister = async (data: RegisterApiResponse) => {
    const { access_token, refresh_token } = data;
    authLog.debug("[AuthProvider] loginAfterRegister called", {
      hasAccessToken: Boolean(access_token),
    });

    await setItemAsync("access_token", access_token);
    await setItemAsync("refresh_token", refresh_token);

    const userInfo = await getUserApi(access_token);
    await userService.syncAuthenticatedUser(userInfo);
    setAccessToken(access_token);
    setIsAuthenticated(true);
    setNeedsReloginForServer(false);
    setIsOfflineWithExpiredToken(false);
    setIsRescuer(userService.getIsRescuer());
    setIsAdmin(userService.getIsAdmin());
  };

  const loginAsGuest = async (credentials: {
    firstName: string;
    lastName: string;
  }) => {
    authLog.debug("[AuthProvider] loginAsGuest called", {
      hasFirstName: Boolean(credentials.firstName?.trim()),
      hasLastName: Boolean(credentials.lastName?.trim()),
    });
    const validationErrors = validateGuestLoginForm(
      credentials.firstName,
      credentials.lastName
    );

    if (hasValidationErrors(validationErrors)) {
      authLog.warn("[AuthProvider] guest login validation failed");
      setErrors(validationErrors);
      return { success: false };
    }

    const username = generateGuestUsername(
      credentials.firstName,
      credentials.lastName
    );
    await userService.syncGuestUser({ ...credentials, username });
    setIsGuest(true);
    authLog.info("[AuthProvider] guest login success");
    return { success: true };
  };

  const registerAndMigrate = async (
    data: RegisterApiRequest
  ): Promise<{ success: boolean; error?: string }> => {
    authLog.debug("[AuthProvider] registerAndMigrate called");
    setLoading(true);
    try {
      const guestUser = await guestUserRepository.getCurrentGuestUser();
      if (!guestUser) {
        authLog.warn("[AuthProvider] registerAndMigrate: no guest user found");
        setLoading(false);
        return { success: false, error: "No guest session found." };
      }

      const res = await registerApi({ ...data, id: guestUser.id });
      const { access_token, refresh_token } = res.data;

      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      await guestMigrationService.migrateAndCleanUp();

      const { setPendingPassword } = await import(
        "@/features/shared/main-container"
      );
      setPendingPassword(data.password);

      await userService.syncAuthenticatedUser(res.data);
      setIsRescuer(userService.getIsRescuer());
      setIsAdmin(userService.getIsAdmin());
      setAccessToken(access_token);
      setIsAuthenticated(true);
      setNeedsReloginForServer(false);
      setIsOfflineWithExpiredToken(false);
      setIsGuest(false);

      authLog.info("[AuthProvider] registerAndMigrate success");
      setLoading(false);
      return { success: true };
    } catch (err) {
      authLog.error("[AuthProvider] registerAndMigrate failed", { error: err });
      setLoading(false);
      return {
        success: false,
        error: "Registration failed. Please try again.",
      };
    }
  };

  const logoutAsGuest = async () => {
    authLog.info("[AuthProvider] logoutAsGuest called");
    setIsGuest(false);
    setIsRescuer(false);
    setIsAdmin(false);
    await deleteItemAsync("userUUID");
    await userService.logout();
  };

  const transitionReloginToOffline = useCallback(() => {
    setNeedsReloginForServer(false);
    setIsOfflineWithExpiredToken(true);
  }, []);

  const transitionOfflineToRelogin = useCallback(() => {
    setIsOfflineWithExpiredToken(false);
    setNeedsReloginForServer(true);
  }, []);

  const logout = async () => {
    authLog.info("[AuthProvider] logout called");
    try {
      await logoutApi();
    } catch (err) {
      authLog.warn("auth › logout api failed", { error: err });
    }
    await deleteItemAsync("access_token");
    await deleteItemAsync("refresh_token");
    await deleteItemAsync("userUUID");
    await userService.logout();
    await clearConnectionConfig();
    clearDeviceSigningKey();
    setAccessToken(null);
    setIsAuthenticated(false);
    setIsRescuer(false);
    setIsAdmin(false);
    setNeedsReloginForServer(false);
    setIsOfflineWithExpiredToken(false);
  };

  return (
    <AuthContext.Provider
      value={{
        login,
        logout,
        loading,
        isBootstrapping,
        errors,
        accessToken,
        isAuthenticated,
        loginAsGuest,
        logoutAsGuest,
        isGuest,
        isRescuer,
        isAdmin,
        loginAfterRegister,
        registerAndMigrate,
        needsReloginForServer,
        isOfflineWithExpiredToken,
        transitionReloginToOffline,
        transitionOfflineToRelogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
