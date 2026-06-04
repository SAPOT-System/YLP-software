# Auth Local-First Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple `isAuthenticated` from JWT validity so rescuers in disaster zones stay authenticated when the server is unreachable.

**Architecture:** JWT becomes a server-access credential only; local identity (WatermelonDB record + `userUUID` in secure store) is the authentication source of truth. The axios interceptor distinguishes network errors (keep tokens) from explicit server 401s (clear tokens + notify context). The bootstrap sets `isAuthenticated = true` as soon as local identity is confirmed, before any network round-trip.

**Tech Stack:** TypeScript, React Native, Expo, jwt-decode, axios, expo-secure-store, WatermelonDB, @testing-library/react-native, Jest

---

## File Map

| File | Change |
|---|---|
| `features/auth/utils/token-utils.ts` | Replace two identical async fns with one sync `isTokenExpiredLocally` |
| `features/auth/utils/__tests__/token-utils.test.ts` | New — unit tests for `isTokenExpiredLocally` |
| `features/shared/api/client.ts` | Add module-level callbacks; update catch block to distinguish 401 vs network error; call callbacks on refresh outcome |
| `features/shared/api/__tests__/client-interceptor.test.ts` | New — tests for the three refresh outcomes |
| `features/auth/context/auth-context.tsx` | Local-first bootstrap; register interceptor callbacks; add `needsReloginForServer` state; remove old token util imports |
| `features/auth/context/__tests__/auth-context.test.tsx` | New — bootstrap and callback wiring tests |

---

## Task 1: Refactor `token-utils.ts`

**Files:**
- Modify: `features/auth/utils/token-utils.ts`
- Create: `features/auth/utils/__tests__/token-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `features/auth/utils/__tests__/token-utils.test.ts`:

```typescript
jest.mock('jwt-decode');
import { jwtDecode } from 'jwt-decode';
import { isTokenExpiredLocally } from '../token-utils';

const mockDecode = jwtDecode as jest.MockedFunction<typeof jwtDecode>;

describe('isTokenExpiredLocally', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true for an empty string', () => {
    expect(isTokenExpiredLocally('')).toBe(true);
  });

  it('returns true when jwtDecode throws (malformed token)', () => {
    mockDecode.mockImplementation(() => {
      throw new Error('Invalid token');
    });
    expect(isTokenExpiredLocally('bad.token')).toBe(true);
  });

  it('returns true when exp is in the past', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    mockDecode.mockReturnValue({ exp: pastExp } as never);
    expect(isTokenExpiredLocally('expired.token.here')).toBe(true);
  });

  it('returns false when exp is in the future', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    mockDecode.mockReturnValue({ exp: futureExp } as never);
    expect(isTokenExpiredLocally('valid.token.here')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx jest features/auth/utils/__tests__/token-utils.test.ts --no-coverage
```

Expected: FAIL — `isTokenExpiredLocally is not a function`

- [ ] **Step 3: Replace `token-utils.ts` with the new implementation**

Overwrite `features/auth/utils/token-utils.ts` with:

```typescript
import { authUtilsLog } from "@/features/shared/utils/logger";
import { jwtDecode } from "jwt-decode";

authUtilsLog.debug("[token-utils] module loaded");

export const isTokenExpiredLocally = (token: string): boolean => {
  if (!token) return true;
  try {
    const { exp } = jwtDecode<{ exp: number }>(token);
    return exp * 1000 <= Date.now();
  } catch (error) {
    authUtilsLog.error("[isTokenExpiredLocally] decode failed", { error });
    return true;
  }
};
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
npx jest features/auth/utils/__tests__/token-utils.test.ts --no-coverage
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Run the TypeScript check**

```bash
npx tsc --noEmit
```

Expected: TS errors in `auth-context.tsx` for the removed imports — those are fixed in Task 3. No new errors in `token-utils.ts` itself.

- [ ] **Step 6: Commit**

```bash
git add features/auth/utils/token-utils.ts features/auth/utils/__tests__/token-utils.test.ts
git commit -m "refactor(auth): replace duplicate token validators with isTokenExpiredLocally"
```

---

## Task 2: Update the `client.ts` Interceptor

**Files:**
- Modify: `features/shared/api/client.ts`
- Create: `features/shared/api/__tests__/client-interceptor.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `features/shared/api/__tests__/client-interceptor.test.ts`:

```typescript
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();
const mockAxiosPost = jest.fn();
const mockInterceptorUse = jest.fn((cb: unknown) => cb);

const mockAxiosInstance = Object.assign(
  jest.fn().mockResolvedValue({ data: {} }),
  {
    defaults: {} as { baseURL?: string },
    interceptors: {
      request: { use: mockInterceptorUse },
      response: { use: mockInterceptorUse },
    },
  }
);

jest.mock("expo-secure-store", () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));

jest.mock("axios", () => ({
  create: jest.fn(() => mockAxiosInstance),
  post: mockAxiosPost,
}));

jest.mock("@/config/runtime", () => ({
  getApiUrl: jest.fn(() => "http://localhost:8000"),
}));

const setup = () => {
  const clientModule = require("../client");
  // calls[0] = request interceptor registration, calls[1] = response interceptor registration
  const errorHandler = mockInterceptorUse.mock.calls[1][1] as (
    err: unknown
  ) => Promise<unknown>;
  return { ...clientModule, errorHandler };
};

const make401Error = () => ({
  config: { headers: {} as Record<string, string>, _retry: false },
  response: { status: 401 },
});

describe("apiClient response interceptor — refresh outcomes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    mockInterceptorUse.mockImplementation((cb: unknown) => cb);
    mockSetItemAsync.mockResolvedValue(undefined);
    mockDeleteItemAsync.mockResolvedValue(undefined);
  });

  it("calls onTokenRefreshed with new access token after successful refresh", async () => {
    mockGetItemAsync.mockResolvedValue("stored-refresh-token");
    mockAxiosPost.mockResolvedValue({
      data: { access_token: "new-access", refresh_token: "new-refresh" },
    });

    const { setTokenRefreshCallback, errorHandler } = setup();
    const onRefreshed = jest.fn();
    setTokenRefreshCallback(onRefreshed);

    await errorHandler(make401Error()).catch(() => {});

    expect(onRefreshed).toHaveBeenCalledWith("new-access");
  });

  it("does not clear tokens when refresh fails due to a network error (no server response)", async () => {
    mockGetItemAsync.mockResolvedValue("stored-refresh-token");
    mockAxiosPost.mockRejectedValue(new Error("Network Error")); // no .response

    const { errorHandler } = setup();
    await errorHandler(make401Error()).catch(() => {});

    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it("clears tokens and calls onAuthFailure when server explicitly rejects refresh with 401", async () => {
    mockGetItemAsync.mockResolvedValue("stored-refresh-token");
    mockAxiosPost.mockRejectedValue({ response: { status: 401 } });

    const { setAuthFailureCallback, errorHandler } = setup();
    const onFailure = jest.fn();
    setAuthFailureCallback(onFailure);

    await errorHandler(make401Error()).catch(() => {});

    expect(mockDeleteItemAsync).toHaveBeenCalledWith("access_token");
    expect(mockDeleteItemAsync).toHaveBeenCalledWith("refresh_token");
    expect(onFailure).toHaveBeenCalled();
  });

  it("does not call onAuthFailure when refresh fails due to a network error", async () => {
    mockGetItemAsync.mockResolvedValue("stored-refresh-token");
    mockAxiosPost.mockRejectedValue(new Error("Network Error")); // no .response

    const { setAuthFailureCallback, errorHandler } = setup();
    const onFailure = jest.fn();
    setAuthFailureCallback(onFailure);

    await errorHandler(make401Error()).catch(() => {});

    expect(onFailure).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx jest features/shared/api/__tests__/client-interceptor.test.ts --no-coverage
```

Expected: FAIL — `setTokenRefreshCallback is not a function` (exports don't exist yet)

- [ ] **Step 3: Update `client.ts`**

Replace the entire contents of `features/shared/api/client.ts` with:

```typescript
import { getApiUrl } from "@/config/runtime";
import axios from "axios";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";

import { apiLog } from "@/features/shared/utils/logger";
apiLog.debug("[api-client] module loaded");

export const apiClient = axios.create({
  baseURL: getApiUrl(),
});

apiLog.info("api › client created", {
  hasBaseUrl: Boolean(apiClient.defaults.baseURL),
});

// Callbacks registered by AuthProvider to keep React state in sync
let onTokenRefreshed: ((token: string) => void) | null = null;
let onAuthFailure: (() => void) | null = null;

export const setTokenRefreshCallback = (cb: (token: string) => void) => {
  onTokenRefreshed = cb;
};

export const setAuthFailureCallback = (cb: () => void) => {
  onAuthFailure = cb;
};

apiClient.interceptors.request.use(async (config) => {
  const accessToken = await getItemAsync("access_token");

  apiLog.debug("api › request", {
    method: config.method,
    url: config.url,
    hasAccessToken: Boolean(accessToken),
  });

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Not a 401, or no server response (network error on original request), or already retried
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return apiClient(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) return Promise.reject(error);

      const { data } = await axios.post<{
        access_token: string;
        refresh_token: string;
      }>(`${getApiUrl()}/auth/refresh`, { refresh_token: refreshToken });

      await setItemAsync("access_token", data.access_token);
      await setItemAsync("refresh_token", data.refresh_token);

      onTokenRefreshed?.(data.access_token);

      apiLog.info("api › token refreshed mid-session");
      processQueue(null, data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);

      const isServerRejection =
        (refreshError as { response?: { status: number } })?.response
          ?.status === 401;

      if (isServerRejection) {
        apiLog.warn("api › server explicitly rejected refresh token, clearing tokens");
        await deleteItemAsync("access_token");
        await deleteItemAsync("refresh_token");
        onAuthFailure?.();
      } else {
        apiLog.warn("api › refresh failed (network error), keeping tokens for offline use");
      }

      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
```

- [ ] **Step 4: Run the new interceptor tests**

```bash
npx jest features/shared/api/__tests__/client-interceptor.test.ts --no-coverage
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Run the existing client tests to check for regressions**

```bash
npx jest features/shared/api/__tests__/client.test.ts --no-coverage
```

Expected: PASS — existing tests still passing

- [ ] **Step 6: Run the TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `client.ts`

- [ ] **Step 7: Commit**

```bash
git add features/shared/api/client.ts features/shared/api/__tests__/client-interceptor.test.ts
git commit -m "feat(auth): distinguish network errors from server 401s in token refresh interceptor"
```

---

## Task 3: Local-First Bootstrap in `auth-context.tsx`

**Files:**
- Modify: `features/auth/context/auth-context.tsx`
- Create: `features/auth/context/__tests__/auth-context.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `features/auth/context/__tests__/auth-context.test.tsx`:

```typescript
import React from "react";
import { Text } from "react-native";
import { render, waitFor } from "@testing-library/react-native";

// --- mocks ---

const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock("expo-secure-store", () => ({
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
  deleteItemAsync: mockDeleteItemAsync,
}));

const mockGetUser = jest.fn();
const mockInitialize = jest.fn();
const mockGetIsRescuer = jest.fn(() => false);
const mockGetIsAdmin = jest.fn(() => false);
const mockSyncAuthenticatedUser = jest.fn();
const mockIsCurrentUserGuest = jest.fn(() => Promise.resolve(false));
const mockLogout = jest.fn();

const mockUserService = {
  getUser: mockGetUser,
  initialize: mockInitialize,
  getIsRescuer: mockGetIsRescuer,
  getIsAdmin: mockGetIsAdmin,
  syncAuthenticatedUser: mockSyncAuthenticatedUser,
  isCurrentUserGuest: mockIsCurrentUserGuest,
  logout: mockLogout,
};

jest.mock("@/features/auth/hooks/use-user-service", () => ({
  useUserService: () => mockUserService,
}));

jest.mock("@/features/auth/hooks/use-auth-container", () => ({
  useAuthContainer: () => ({
    guestUserRepository: { getCurrentGuestUser: jest.fn() },
    guestMigrationService: {},
    peerService: { findPeerById: jest.fn() },
  }),
}));

const mockSetTokenRefreshCallback = jest.fn();
const mockSetAuthFailureCallback = jest.fn();

jest.mock("@/features/shared/api/client", () => ({
  setTokenRefreshCallback: mockSetTokenRefreshCallback,
  setAuthFailureCallback: mockSetAuthFailureCallback,
}));

jest.mock("@/features/shared", () => ({
  getUserApi: jest.fn(),
}));

jest.mock("@/features/shared/stores/secure-config", () => ({
  clearConnectionConfig: jest.fn(),
}));

jest.mock("@/features/auth/api", () => ({
  register: jest.fn(),
  loginApi: jest.fn(),
  logoutApi: jest.fn(),
  refreshTokenApi: jest.fn(),
}));

jest.mock("@/features/auth/utils/token-utils", () => ({
  isTokenExpiredLocally: jest.fn(() => false),
}));

// --- helpers ---

import { AuthProvider, useAuth } from "../auth-context";

const TestConsumer = () => {
  const { isAuthenticated, loading, needsReloginForServer } = useAuth();
  return (
    <>
      <Text testID="authenticated">{String(isAuthenticated)}</Text>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="needsRelogin">{String(needsReloginForServer)}</Text>
    </>
  );
};

const renderProvider = () =>
  render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );

// --- tests ---

describe("AuthProvider bootstrap — local-first identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockSyncAuthenticatedUser.mockResolvedValue(undefined);
    mockIsCurrentUserGuest.mockResolvedValue(false);
  });

  it("sets isAuthenticated=true when userUUID and local DB record exist", async () => {
    mockGetItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("some-token");
      return Promise.resolve(null);
    });
    mockGetUser.mockReturnValue({ id: "uuid-123", username: "rescuer" });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
      expect(getByTestId("loading").props.children).toBe("false");
    });
  });

  it("does not call getUserApi when local identity is confirmed", async () => {
    const { getUserApi } = require("@/features/shared");
    mockGetItemAsync.mockImplementation((key: string) => {
      if (key === "userUUID") return Promise.resolve("uuid-123");
      if (key === "access_token") return Promise.resolve("some-token");
      return Promise.resolve(null);
    });
    mockGetUser.mockReturnValue({ id: "uuid-123", username: "rescuer" });

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("true");
    });

    expect(getUserApi).not.toHaveBeenCalled();
  });

  it("registers setTokenRefreshCallback and setAuthFailureCallback on mount", async () => {
    mockGetItemAsync.mockResolvedValue(null);

    renderProvider();

    await waitFor(() => {
      expect(mockSetTokenRefreshCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
      expect(mockSetAuthFailureCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  it("sets needsReloginForServer=true when the onAuthFailure callback fires", async () => {
    mockGetItemAsync.mockResolvedValue(null);

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(mockSetAuthFailureCallback).toHaveBeenCalled();
    });

    // Simulate the interceptor signalling auth failure
    const onAuthFailure = mockSetAuthFailureCallback.mock.calls[0][0] as () => void;
    onAuthFailure();

    await waitFor(() => {
      expect(getByTestId("needsRelogin").props.children).toBe("true");
    });
  });

  it("stays unauthenticated when no userUUID and no guest session", async () => {
    mockGetItemAsync.mockResolvedValue(null);
    mockIsCurrentUserGuest.mockResolvedValue(false);

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId("authenticated").props.children).toBe("false");
      expect(getByTestId("loading").props.children).toBe("false");
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx jest features/auth/context/__tests__/auth-context.test.tsx --no-coverage
```

Expected: FAIL — `needsReloginForServer` not in context, old bootstrap logic

- [ ] **Step 3: Update `auth-context.tsx`**

Replace the entire contents of `features/auth/context/auth-context.tsx` with:

```typescript
import { getUserApi } from "@/features/shared";
import {
  setAuthFailureCallback,
  setTokenRefreshCallback,
} from "@/features/shared/api/client";
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
  validateGuestLoginForm,
} from "../utils/";
import { clearConnectionConfig } from "@/features/shared/stores/secure-config";

interface AuthContextI {
  login: (credentials: LoginApiRequest) => Promise<{ success: boolean }>;
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
  errors: LoginFormErrors;
  isAuthenticated: boolean;
  accessToken: string | null;
  isGuest: boolean;
  isRescuer: boolean;
  isAdmin: boolean;
  needsReloginForServer: boolean;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsReloginForServer, setNeedsReloginForServer] = useState(false);
  const userService = useUserService();
  const { guestUserRepository, guestMigrationService, peerService } =
    useAuthContainer();

  useEffect(() => {
    setTokenRefreshCallback((token) => setAccessToken(token));
    setAuthFailureCallback(() => setNeedsReloginForServer(true));
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      authLog.debug("[AuthProvider] refreshSession called");
      const refreshToken = await getItemAsync("refresh_token");
      if (!refreshToken) {
        authLog.warn("[AuthProvider] missing refresh token");
        return false;
      }

      const { access_token, refresh_token } = await refreshTokenApi(refreshToken);
      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      const userInfo = await getUserApi(access_token);
      await userService.syncAuthenticatedUser(userInfo);
      setIsRescuer(userService.getIsRescuer());
      setIsAdmin(userService.getIsAdmin());
      setAccessToken(access_token);
      setIsAuthenticated(true);
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
      }
      return false;
    }
  }, [userService, peerService]);

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

            if (!storedToken || isTokenExpiredLocally(storedToken)) {
              refreshSession().catch(() => {});
            }
            return;
          }

          authLog.warn("[AuthProvider] no local record, attempting server refresh");
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

    try {
      const res = await loginApi(credentials);
      setLoading(false);

      const { access_token, refresh_token } = res.data;
      await setItemAsync("access_token", access_token);
      await setItemAsync("refresh_token", refresh_token);

      const userInfo = await getUserApi(access_token);
      const { setPendingPassword } = await import("@/features/shared/main-container");
      setPendingPassword(credentials.password);

      await userService.syncAuthenticatedUser(userInfo);
      setAccessToken(access_token);
      setIsAuthenticated(true);
      setNeedsReloginForServer(false);
      setIsRescuer(userService.getIsRescuer());
      setIsAdmin(userService.getIsAdmin());
      return { success: true };
    } catch (err) {
      authLog.error("auth › login failed", { error: err });
      setLoading(false);

      const axiosError = err as AxiosError<LoginApiErrorResponse>;
      if (!axiosError.response) return { success: false };

      const status = axiosError.response.status;
      const data = axiosError.response.data;
      authLog.warn("auth › login error response", { status, hasData: Boolean(data) });

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
    setNeedsReloginForServer(false);
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

    const username = generateGuestUsername(credentials.firstName, credentials.lastName);
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

      const { setPendingPassword } = await import("@/features/shared/main-container");
      setPendingPassword(data.password);

      await userService.syncAuthenticatedUser(res.data);
      setIsRescuer(userService.getIsRescuer());
      setIsAdmin(userService.getIsAdmin());
      setAccessToken(access_token);
      setIsAuthenticated(true);
      setNeedsReloginForServer(false);
      setIsGuest(false);

      authLog.info("[AuthProvider] registerAndMigrate success");
      setLoading(false);
      return { success: true };
    } catch (err) {
      authLog.error("[AuthProvider] registerAndMigrate failed", { error: err });
      setLoading(false);
      return { success: false, error: "Registration failed. Please try again." };
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
    setIsAdmin(false);
    setNeedsReloginForServer(false);
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
        isAdmin,
        loginAfterRegister,
        registerAndMigrate,
        needsReloginForServer,
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
```

- [ ] **Step 4: Run the new auth-context tests**

```bash
npx jest features/auth/context/__tests__/auth-context.test.tsx --no-coverage
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Run the TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Run the full test suite**

```bash
npm test -- --no-coverage
```

Expected: all tests pass — no regressions in `client.test.ts`, existing auth hook tests, or component tests

- [ ] **Step 7: Commit**

```bash
git add features/auth/context/auth-context.tsx features/auth/context/__tests__/auth-context.test.tsx
git commit -m "feat(auth): local-first bootstrap — identity from local DB, JWT is server credential only"
```

---

## Done

After all three tasks are committed, the app will:

- **Authenticate immediately** from local DB — no spinner waiting for the network
- **Stay authenticated offline** — network errors never trigger logout
- **Only clear tokens** when the server explicitly returns 401 on the refresh call
- **Keep `accessToken` in context fresh** after every silent mid-session refresh
- **Expose `needsReloginForServer`** for screens to show a non-blocking reconnect banner when the server session has definitively expired
