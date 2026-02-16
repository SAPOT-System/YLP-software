// Mock expo-updates with a mutable manifest
const mockManifest = { extra: {} };
jest.mock("expo-updates", () => ({
  get manifest() {
    return mockManifest;
  },
}));

describe("getApiUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Reset mock manifest
    Object.assign(mockManifest, { extra: {} });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should return development URL when NODE_ENV is development", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "development";

    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe("http://10.0.2.2:8000");
  });

  it("should return manifest URL when NODE_ENV is production and manifest has apiUrl", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";
    const mockApiUrl = "https://api.example.com";

    // Set up mock manifest
    Object.assign(mockManifest, {
      extra: {
        apiUrl: mockApiUrl,
      },
    });

    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe(mockApiUrl);
  });

  it("should return undefined when NODE_ENV is production and manifest has no apiUrl", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";

    // Mock manifest with no extra.apiUrl
    Object.assign(mockManifest, {});

    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBeUndefined();
  });

  it("should return undefined when NODE_ENV is production and manifest extra is undefined", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.env as any).NODE_ENV = "production";

    // Mock manifest with undefined extra
    Object.assign(mockManifest, {
      extra: undefined,
    });

    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBeUndefined();
  });
});
