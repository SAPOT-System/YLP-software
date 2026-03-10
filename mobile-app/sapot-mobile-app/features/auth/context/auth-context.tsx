import { getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";
import React, { createContext, useContext, useEffect, useState } from "react";
import { LoginApiErrorResponse, LoginApiRequest } from "../types";
import { loginApi } from "../api";
import { AxiosError } from "axios";
import { isAccessTokenValid } from "../utils/";

interface AuthContextI {
  login: (credentials: LoginApiRequest) => Promise<{ success: boolean }>;
  logout: () => void;
  loading: boolean;
  errors: LoginFormErrors;
  isAuthenticated: boolean;
  accessToken: string | null;
}
const AuthContext = createContext<AuthContextI | null>(null);

interface LoginFormErrors {
  username?: string;
  password?: string;
  general?: string;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const token = await getItemAsync("token");
      setAccessToken(token);
      setIsAuthenticated(token ? await isAccessTokenValid(token) : false);
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
      console.log(res.data);

      const { access_token } = res.data;

      await setItemAsync("token", access_token);
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

  const logout = async () => {
    await deleteItemAsync("token");
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
      value={{ login, logout, loading, errors, accessToken, isAuthenticated }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
