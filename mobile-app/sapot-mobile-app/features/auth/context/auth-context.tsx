import { getUserApi } from "@/features/shared";
import { authLog } from "@/features/shared/utils/logger";
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
} from "../api";
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
  isAccessTokenValid,
  isRefreshTokenValid,
  validateGuestLoginForm,
} from "../utils/";
import { clearConnectionConfig } from "@/features/shared/stores/secure-config";

interface AuthContextI {
  login: (credentials: LoginApiRequest) => Promise<{ success: boolean }>;
  loginAsGuest: (credentials: {
    firstName: string;
    lastName: string;
  }) => Promise<{
    success: boolean;
  }>;
  loginAfterRegister: (data: RegisterApiResponse) => Promise<void>;
  registerAndMigrate: (
    data: RegisterApiRequest
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logoutAsGuest: () => Promise<void>;
  loading: boolean;
  errors: LoginFormErrors;
  isAuthenticated: boolean;
  accessToken: string | null;
  isGuest: boolean;
  isRescuer: boolean;
}
const AuthContext = createContext<AuthContextI | null>(null);

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
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isRescuer, setIsRescuer] = useState(false);
  const userService = useUserService();
  const { guestUserRepository, guestMigrationService, peerService } =
    useAuthContainer();

  const refreshSession = useCallback(async () => {
    try {
      authLog.debug("[AuthProvider] refreshSession called");
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) {
        authLog.warn("[AuthProvider] missing refresh token");
        return false;
      }
      const isRefreshValid = await isRefreshTokenValid(refreshToken);
      if (!isRefreshValid) {
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

      setAccessToken(access_token);
      setIsAuthenticated(await isAccessTokenValid(access_token));
      return true;
    } catch (err) {
      authLog.warn("auth › refresh session failed", { error: err });
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
        setIsAuthenticated(true);

        return true;
      } else {
        return false;
      }
    }
  }, [userService, peerService]);

  useEffect(() => {
    (async () => {
      authLog.debug("auth › bootstrap start");
      setLoading(true);
      try {
        const token = await getItemAsync("access_token");
        const uuid = await getItemAsync("userUUID");
        if (token && uuid) {
          authLog.info("[AuthProvider] restoring authenticated session");

          const isValid = await isAccessTokenValid(token);
          if (isValid) {
            await userService.initialize({ isGuest: false });
            try {
              userService.getUser();
              setIsRescuer(userService.getIsRescuer());
              setAccessToken(token);
              setIsAuthenticated(true);
            } catch {
              authLog.warn("auth › user missing from local DB, falling back to refresh");
              await refreshSession();
            }
          } else {
            await refreshSession();
          }
        } else if (await userService.isCurrentUserGuest()) {
          authLog.info("[AuthProvider] restoring guest session");
          await userService.initialize({ isGuest: true });
          setIsGuest(true);
        }
      } catch (err) {
        authLog.error("auth › bootstrap failed", { error: err });
      } finally {
        setLoading(false);
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

    // Basic client-side validation
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

    try {
      const res = await loginApi(credentials);
      setLoading(false);

      const { access_token, refresh_token } = res.data;

      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      const userInfo = await getUserApi(access_token);

      // Store raw password briefly for LocalEncryptionService.initialize()
      const { setPendingPassword } = await import("@/features/shared/main-container");
      setPendingPassword(credentials.password);

      await userService.syncAuthenticatedUser(userInfo);

      setAccessToken(access_token);
      setIsAuthenticated(true);
      setIsRescuer(userService.getIsRescuer());
      return {
        success: true,
      };
    } catch (err) {
      authLog.error("auth › login failed", { error: err });
      setLoading(false);

      const axiosError = err as AxiosError<LoginApiErrorResponse>;

      // Network error
      if (!axiosError.response) {
        return { success: false };
      }

      const status = axiosError.response.status;
      const data = axiosError.response.data;
      authLog.warn("auth › login error response", {
        status,
        hasData: Boolean(data),
      });

      if (status === 401) {
        setErrors({ general: data.detail });
        return { success: false };
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
    setIsRescuer(userService.getIsRescuer());
  };

  const loginAsGuest = async (credentials: {
    firstName: string;
    lastName: string;
  }) => {
    authLog.debug("[AuthProvider] loginAsGuest called", {
      hasFirstName: Boolean(credentials.firstName?.trim()),
      hasLastName: Boolean(credentials.lastName?.trim()),
    });
    const errors = validateGuestLoginForm(
      credentials.firstName,
      credentials.lastName
    );

    if (hasValidationErrors(errors)) {
      authLog.warn("[AuthProvider] guest login validation failed");
      setErrors(errors);
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

      await guestMigrationService.cleanUp();

      const { setPendingPassword } = await import("@/features/shared/main-container");
      setPendingPassword(data.password);

      await userService.syncAuthenticatedUser(res.data);
      setIsRescuer(userService.getIsRescuer());
      setAccessToken(access_token);
      setIsAuthenticated(true);
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
    await deleteItemAsync("userUUID");

    await userService.logout();
  };

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
    setAccessToken(null);
    setIsAuthenticated(false);
    setIsRescuer(false);
  };

  return (
    <AuthContext.Provider
      value={{
        login,
        logout,
        loading,
        errors,
        accessToken,
        isAuthenticated,
        loginAsGuest,
        logoutAsGuest,
        isGuest,
        isRescuer,
        loginAfterRegister,
        registerAndMigrate,
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
