// Mock expo-updates
jest.mock("expo-updates", () => ({
  channel: "preview",
}));

describe("getApiUrl", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return development URL when in development mode", () => {
    // __DEV__ is true in test environment
    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();
    
    // In test environment, __DEV__ is typically true
    expect(result).toBe("http://10.0.2.2:8000");
  });

  it("should return preview URL when channel is preview", () => {
    // Mock the Updates module with specific channel before importing
    jest.doMock("expo-updates", () => ({
      channel: "preview",
    }));
    
    jest.resetModules();
    
    // Set __DEV__ to false to bypass development check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    
    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe("https://ylp-software.onrender.com");
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return production URL when channel is production", () => {
    jest.doMock("expo-updates", () => ({
      channel: "production",
    }));
    
    jest.resetModules();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    
    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe("https://ylp-software.onrender.com");
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return development URL when channel is unknown", () => {
    jest.doMock("expo-updates", () => ({
      channel: "unknown-channel",
    }));
    
    jest.resetModules();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;
    
    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe("http://10.0.2.2:8000");
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });
});
