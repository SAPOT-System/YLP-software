import { getUserApi } from "@/features/shared";
import { AxiosError } from "axios";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, { createContext, useContext, useEffect, useState } from "react";
import { loginApi, logoutApi, refreshTokenApi } from "../api";
import { useUserService } from "../hooks/use-user-service";
import {
  LoginApiErrorResponse,
  LoginApiRequest,
  RegisterApiResponse,
} from "../types";
import {
  generateGuestUsername,
  hasValidationErrors,
  isAccessTokenValid,
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
  logout: () => Promise<void>;
  logoutAsGuest: () => Promise<void>;
  loading: boolean;
  errors: LoginFormErrors;
  isAuthenticated: boolean;
  accessToken: string | null;
  isGuest: boolean;
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
  const userService = useUserService();

  const refreshSession = async () => {
    try {
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) {
        return false;
      }

      const { access_token, refresh_token } = await refreshTokenApi(
        refreshToken
      );
      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      const userInfo = await getUserApi(access_token);
      await userService.syncAuthenticatedUser(userInfo);

      setAccessToken(access_token);
      setIsAuthenticated(await isAccessTokenValid(access_token));
      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  };

  useEffect(() => {
    (async () => {
      console.log("AuthProvider effect");
      setLoading(true);
      const token = await getItemAsync("access_token");
      const uuid = await getItemAsync("userUUID");
      if (token && uuid) {
        await userService.initialize({ isGuest: false });
        setAccessToken(token);

        const isValid = await isAccessTokenValid(token);
        if (isValid) {
          setIsAuthenticated(true);
        } else {
          await refreshSession();
        }
      } else if (await userService.isCurrentUserGuest()) {
        await userService.initialize({ isGuest: true });
        setIsGuest(true);
      }
      setLoading(false);
    })();
  }, []);

  const login = async (credentials: LoginApiRequest) => {
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
      return {
        success: true,
      };
    } catch (err) {
      console.log(err);
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
      console.log(status, data);

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

    const userInfo = await getUserApi(access_token);
    await userService.syncAuthenticatedUser(userInfo);

    setIsAuthenticated(await isAccessTokenValid(access_token));
  };

  const loginAsGuest = async (credentials: {
    firstName: string;
    lastName: string;
  }) => {
    const errors = validateGuestLoginForm(
      credentials.firstName,
      credentials.lastName
    );

    if (hasValidationErrors(errors)) {
      setErrors(errors);
      return { success: false };
    }

    const username = generateGuestUsername(
      credentials.firstName,
      credentials.lastName
    );

    await userService.syncGuestUser({ ...credentials, username });

    setIsGuest(true);

    return { success: true };
  };

  const logoutAsGuest = async () => {
    setIsGuest(false);
    await deleteItemAsync("userUUID");

    await userService.logout();
  };

  const logout = async () => {
    try {
      await logoutApi();
    } catch (err) {
      console.log(err);
    }
    await deleteItemAsync("access_token");
    await deleteItemAsync("refresh_token");
    await deleteItemAsync("userUUID");

    await userService.logout();
    setAccessToken(null);
    setIsAuthenticated(false);
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
        loginAfterRegister,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
