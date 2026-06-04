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
  const calls = mockInterceptorUse.mock.calls as unknown[][];
  const errorHandler = calls[1][1] as (err: unknown) => Promise<unknown>;
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
