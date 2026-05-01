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
  // TODO: remove
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [isRescuer, setIsRescuer] = useState(false);
  const userService = useUserService();
  const { guestUserRepository, guestMigrationService } = useAuthContainer();

  const refreshSession = useCallback(async () => {
    try {
      authLog.debug("[AuthProvider] refreshSession called");
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) {
        authLog.warn("[AuthProvider] missing refresh token");
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
      throw err;
    }
  }, [userService]);

  useEffect(() => {
    (async () => {
      authLog.debug("auth › bootstrap start");
      setLoading(true);
      const token = await getItemAsync("access_token");
      const refreshToken = await getItemAsync("refresh_token");
      const uuid = await getItemAsync("userUUID");
      if (token && uuid) {
        authLog.info("[AuthProvider] restoring authenticated session");

        const isValid = await isAccessTokenValid(token);
        if (isValid) {
          await userService.initialize({ isGuest: false });
          setIsRescuer(userService.getIsRescuer());
          setAccessToken(token);
          setIsAuthenticated(true);
        } else {
          try {
            await refreshSession();
          } catch {
            setAccessToken(null);
            if (!refreshToken) {
              setIsAuthenticated(false);
            } else {
              const isRefreshValid = await isRefreshTokenValid(refreshToken);
              setIsAuthenticated(isRefreshValid);
            }
          }
        }
      } else if (await userService.isCurrentUserGuest()) {
        authLog.info("[AuthProvider] restoring guest session");
        await userService.initialize({ isGuest: true });
        setIsGuest(true);
      }
      setLoading(false);
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

      await userService.syncAuthenticatedUser(userInfo);

      setAccessToken(access_token);
      setIsAuthenticated(await isAccessTokenValid(access_token));
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
        setErrors({
          general: "Network error. Please check your connection to the server.",
        });
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
    const { access_token } = data;

    authLog.debug("[AuthProvider] loginAfterRegister called", {
      hasAccessToken: Boolean(access_token),
    });

    const userInfo = await getUserApi(access_token);
    await userService.syncAuthenticatedUser(userInfo);

    setIsAuthenticated(await isAccessTokenValid(access_token));
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

      await userService.syncAuthenticatedUser(res.data);
      setIsRescuer(userService.getIsRescuer());
      setAccessToken(access_token);
      setIsAuthenticated(await isAccessTokenValid(access_token));
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
    setAccessToken(null);
    setIsAuthenticated(false);
    setIsRescuer(false);
  };

  // silent login on app start
  //   const bootstrapAuth = async () => {
  //     const refreshToken = await SecureStore.getItemAsync("refresh_token");

  //     if (!refreshToken) {
  //       setLoading(false);
  //       return;
  //     }

  //     try {
  //       const res = await api.post("/refresh", {
  //         refreshToken,
  //       });

  //       tokenService.setAccessToken(res.data.accessToken);
  //     } catch {
  //       await logout();
  //     } finally {
  //       setLoading(false);
  //     }
  //   };

  //   useEffect(() => {
  //     bootstrapAuth();
  //   }, []);

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
