// Mock axios before importing
const mockAxiosCreate = jest.fn();
jest.mock("axios", () => ({
  create: mockAxiosCreate,
}));

// Mock getApiUrl
const mockGetApiUrl = jest.fn();
jest.mock("@/config/runtime", () => ({
  getApiUrl: mockGetApiUrl,
}));

describe("apiClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create axios instance with correct baseURL", () => {
    const mockUrl = "http://localhost:8000";
    mockGetApiUrl.mockReturnValue(mockUrl);
    
    const mockAxiosInstance = { defaults: { baseURL: mockUrl } };
    mockAxiosCreate.mockReturnValue(mockAxiosInstance);

    // Import the module to trigger axios.create
    jest.resetModules();
    require("../client");

    expect(mockAxiosCreate).toHaveBeenCalledWith({
      baseURL: mockUrl,
    });
  });

  it("should use development URL when getApiUrl returns development URL", () => {
    const developmentUrl = "http://10.0.2.2:8000";
    mockGetApiUrl.mockReturnValue(developmentUrl);
    
    const mockAxiosInstance = { defaults: { baseURL: developmentUrl } };
    mockAxiosCreate.mockReturnValue(mockAxiosInstance);
    
    jest.resetModules();
    require("../client");

    expect(mockAxiosCreate).toHaveBeenCalledWith({
      baseURL: developmentUrl,
    });
  });

  it("should export apiClient with correct configuration", () => {
    const testUrl = "https://api.test.com";
    mockGetApiUrl.mockReturnValue(testUrl);
    
    const mockAxiosInstance = { 
      defaults: { baseURL: testUrl },
      get: jest.fn(),
      post: jest.fn() 
    };
    mockAxiosCreate.mockReturnValue(mockAxiosInstance);
    
    jest.resetModules();
    const { apiClient } = require("../client");

    expect(apiClient).toBe(mockAxiosInstance);
  });
});