describe("logger file logging", () => {
  const ORIGINAL_FLAG = process.env.EXPO_PUBLIC_LOG_TO_FILE;

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) {
      delete process.env.EXPO_PUBLIC_LOG_TO_FILE;
    } else {
      process.env.EXPO_PUBLIC_LOG_TO_FILE = ORIGINAL_FLAG;
    }
    jest.resetModules();
  });

  const expectedFileName = (): string => {
    // Mirrors fileAsyncTransport's ISO format: YYYY-M-D (non-zero-padded).
    const today = new Date();
    const iso = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
    return `sapot-${iso}.log`;
  };

  test("getLogFilePath composes the document directory and today's file name", () => {
    // Arrange / Act
    const { getLogFilePath } = require("../logger");

    // Assert — mock Paths.document.uri is file:///mock/documents/
    expect(getLogFilePath()).toBe(`file:///mock/documents/${expectedFileName()}`);
  });

  test("getLogFilePath strips the trailing slash from the document directory", () => {
    const { getLogFilePath } = require("../logger");

    expect(getLogFilePath()).not.toContain("documents//");
  });

  test("clearLogFile is a no-op when the file does not exist", () => {
    const { clearLogFile } = require("../logger");

    expect(() => clearLogFile()).not.toThrow();
  });

  test("getDevServerInfo returns null when no dev bundle URL is available", () => {
    const { NativeModules } = require("react-native");
    delete NativeModules.SourceCode;
    const { getDevServerInfo } = require("../logger");

    expect(getDevServerInfo()).toBeNull();
  });

  test("getDevServerInfo parses laptop host and Metro port from the bundle URL", () => {
    const { NativeModules } = require("react-native");
    NativeModules.SourceCode = {
      scriptURL: "http://192.168.1.16:8082/index.bundle?platform=android&dev=true",
    };
    const { getDevServerInfo } = require("../logger");

    expect(getDevServerInfo()).toEqual({ host: "192.168.1.16", port: "8082" });
    delete NativeModules.SourceCode;
  });

  test("getDevServerInfo defaults to Metro port 8081 when the URL omits a port", () => {
    const { NativeModules } = require("react-native");
    NativeModules.SourceCode = { scriptURL: "http://192.168.1.16/index.bundle" };
    const { getDevServerInfo } = require("../logger");

    expect(getDevServerInfo()).toEqual({ host: "192.168.1.16", port: "8081" });
    delete NativeModules.SourceCode;
  });

  test("module loads with file logging enabled via EXPO_PUBLIC_LOG_TO_FILE=1", () => {
    // Arrange
    process.env.EXPO_PUBLIC_LOG_TO_FILE = "1";
    jest.resetModules();

    // Act / Assert — importing must wire the file transport without throwing.
    expect(() => {
      const mod = require("../logger");
      mod.default.info("[test] file logging enabled");
    }).not.toThrow();
  });
});
