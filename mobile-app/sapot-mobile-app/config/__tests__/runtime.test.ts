// Mock expo-updates
jest.mock("expo-updates", () => ({
  channel: "preview",
}));

const originalDevHost = process.env.EXPO_PUBLIC_DEV_HOST;

beforeEach(() => {
  process.env.EXPO_PUBLIC_DEV_HOST = "192.168.1.10";
});

afterEach(() => {
  process.env.EXPO_PUBLIC_DEV_HOST = originalDevHost;
});

describe("getApiUrl", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return development URL when in development mode", () => {
    const { getApiUrl } = require("../runtime");
    const result = getApiUrl();

    expect(result).toBe("https://192.168.1.10");
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

    expect(result).toBe("https://server.sapot.lan");

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

    expect(result).toBe("https://server.sapot.lan");

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

    expect(result).toBe("https://192.168.1.10");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });
});

describe("getWsUrl", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return development websocket URL when in development mode", () => {
    const { getWsUrl } = require("../runtime");
    const result = getWsUrl();

    expect(result).toBe("wss://192.168.1.10");
  });

  it("should return preview websocket URL when channel is preview", () => {
    jest.doMock("expo-updates", () => ({
      channel: "preview",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getWsUrl } = require("../runtime");
    const result = getWsUrl();

    expect(result).toBe("wss://server.sapot.lan");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return production websocket URL when channel is production", () => {
    jest.doMock("expo-updates", () => ({
      channel: "production",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getWsUrl } = require("../runtime");
    const result = getWsUrl();

    expect(result).toBe("wss://server.sapot.lan");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return development websocket URL when channel is unknown", () => {
    jest.doMock("expo-updates", () => ({
      channel: "unknown-channel",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getWsUrl } = require("../runtime");
    const result = getWsUrl();

    expect(result).toBe("wss://192.168.1.10");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });
});

describe("getTileServerUrl", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return development tile server URL when in development mode", () => {
    const { getTileServerUrl } = require("../runtime");
    const result = getTileServerUrl();

    expect(result).toBe("https://192.168.1.10/tiles");
  });

  it("should return preview tile server URL when channel is preview", () => {
    jest.doMock("expo-updates", () => ({
      channel: "preview",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getTileServerUrl } = require("../runtime");
    const result = getTileServerUrl();

    expect(result).toBe("https://server.sapot.lan/tiles");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return production tile server URL when channel is production", () => {
    jest.doMock("expo-updates", () => ({
      channel: "production",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getTileServerUrl } = require("../runtime");
    const result = getTileServerUrl();

    expect(result).toBe("https://server.sapot.lan/tiles");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });

  it("should return development tile server URL when channel is unknown", () => {
    jest.doMock("expo-updates", () => ({
      channel: "unknown-channel",
    }));

    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = false;

    const { getTileServerUrl } = require("../runtime");
    const result = getTileServerUrl();

    expect(result).toBe("https://192.168.1.10/tiles");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).__DEV__ = true;
  });
});
