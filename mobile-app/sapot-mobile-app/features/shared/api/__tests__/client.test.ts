// Mock axios and dependencies
const mockInterceptorUse = jest.fn((callback) => callback);
const mockAxiosInstance = {
  interceptors: {
    request: {
      use: mockInterceptorUse,
    },
  },
};

jest.mock("axios", () => ({
  create: jest.fn(() => mockAxiosInstance),
}));

const mockGetApiUrl = jest.fn(() => "http://localhost:8000");
jest.mock("@/config/runtime", () => ({
  getApiUrl: mockGetApiUrl,
}));

const mockTokenService = {
  getAccessToken: jest.fn<string | null, []>(),
};
jest.mock("@/features/auth/service/token-service", () => ({
  tokenService: mockTokenService,
}));

describe("apiClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it("should create axios instance with correct baseURL from getApiUrl", () => {
    const testUrl = "http://localhost:8000";
    mockGetApiUrl.mockReturnValue(testUrl);

    const axios = require("axios");
    require("../client");

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: testUrl,
    });
  });

  it("should setup request interceptor", () => {
    require("../client");

    expect(mockInterceptorUse).toHaveBeenCalled();
  });

  it("should add Authorization header when token exists", async () => {
    const testToken = "test-token-123";
    mockTokenService.getAccessToken.mockReturnValue(testToken);

    require("../client");
    const interceptorCallback = mockInterceptorUse.mock.calls[0][0];
    const config = { headers: {} };
    const result = await interceptorCallback(config);

    expect(result.headers.Authorization).toBe(`Bearer ${testToken}`);
  });

  it("should not add Authorization header when token is null", async () => {
    mockTokenService.getAccessToken.mockReturnValue(null);

    require("../client");
    const interceptorCallback = mockInterceptorUse.mock.calls[0][0];
    const config = { headers: {} };
    const result = await interceptorCallback(config);

    expect(result.headers.Authorization).toBeUndefined();
  });
});
