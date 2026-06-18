/**
 * Tests for WebrtcSessionManager session-log beacon (ADR-0005 / issue 0007).
 *
 * The manager emits `session › accepted` log lines in development and preview
 * builds when a new WebRTC adapter is created. These lines are scraped by the
 * stress-test's parseSessionEvents.
 */

const makeMockAdapter = () => ({
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  removeAllListeners: jest.fn(),
  cleanup: jest.fn(),
  isConnected: false,
});

describe("WebrtcSessionManager — session log beacon", () => {
  beforeEach(() => jest.resetModules());
  afterEach(() => jest.resetModules());

  function makeLog() {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  }

  function loadWithVariant(variant: string | undefined) {
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig: { extra: variant ? { appVariant: variant } : {} } },
    }));
    const mockWebrtcLog = makeLog();
    // Use a Proxy so any logger name (utilLog, signalingLog, etc.) accessed by
    // transitively-loaded modules returns a noop mock automatically.
    jest.doMock("@/features/shared/utils/logger", () =>
      new Proxy({ webrtcLog: mockWebrtcLog }, {
        get(target, prop: string) {
          return (target as Record<string, unknown>)[prop] ?? makeLog();
        },
      })
    );
    jest.doMock("../../adapters/webrtc-adapter", () => ({
      WebrtcAdapter: jest.fn().mockImplementation(makeMockAdapter),
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebrtcSessionManager } = require("../webrtc-session-manager") as {
      WebrtcSessionManager: new (
        userStore: { user: { id: string } },
        networkConfig: object,
      ) => { getWebrtcAdapter: (peerId: string) => unknown };
    };
    const mockUserStore = { user: { id: "self-user" } };
    const manager = new WebrtcSessionManager(mockUserStore, {});
    return { manager, mockWebrtcLog };
  }

  it("emits session › accepted in development builds when new adapter is created", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("development");

    manager.getWebrtcAdapter("peer-abc");

    const acceptedCall = (mockWebrtcLog.info as jest.Mock).mock.calls.find(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCall).toBeDefined();
    expect(acceptedCall[1]).toMatchObject({ peerId: "peer-abc", activeSessions: 1 });
  });

  it("emits session › accepted in preview builds when new adapter is created", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("preview");

    manager.getWebrtcAdapter("peer-xyz");

    const acceptedCall = (mockWebrtcLog.info as jest.Mock).mock.calls.find(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCall).toBeDefined();
    expect(acceptedCall[1]).toMatchObject({ peerId: "peer-xyz", activeSessions: 1 });
  });

  it("does NOT emit session › accepted in production builds", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("production");

    manager.getWebrtcAdapter("peer-prod");

    const acceptedCall = (mockWebrtcLog.info as jest.Mock).mock.calls.find(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCall).toBeUndefined();
  });

  it("does NOT emit session › accepted when variant is absent", () => {
    const { manager, mockWebrtcLog } = loadWithVariant(undefined);

    manager.getWebrtcAdapter("peer-no-variant");

    const acceptedCall = (mockWebrtcLog.info as jest.Mock).mock.calls.find(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCall).toBeUndefined();
  });

  it("activeSessions increments with each new peer in dev builds", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("development");

    manager.getWebrtcAdapter("peer-1");
    manager.getWebrtcAdapter("peer-2");

    const acceptedCalls = (mockWebrtcLog.info as jest.Mock).mock.calls.filter(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCalls).toHaveLength(2);
    expect(acceptedCalls[0][1]).toMatchObject({ peerId: "peer-1", activeSessions: 1 });
    expect(acceptedCalls[1][1]).toMatchObject({ peerId: "peer-2", activeSessions: 2 });
  });

  it("does NOT emit session › accepted again when returning an existing adapter", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("development");

    manager.getWebrtcAdapter("peer-1");
    manager.getWebrtcAdapter("peer-1");

    const acceptedCalls = (mockWebrtcLog.info as jest.Mock).mock.calls.filter(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCalls).toHaveLength(1);
  });

  it("sessionId in payload contains the peerId", () => {
    const { manager, mockWebrtcLog } = loadWithVariant("development");

    manager.getWebrtcAdapter("peer-sess");

    const acceptedCall = (mockWebrtcLog.info as jest.Mock).mock.calls.find(
      ([msg]: [string]) => msg === "session › accepted"
    );
    expect(acceptedCall).toBeDefined();
    const { sessionId } = acceptedCall[1];
    expect(typeof sessionId).toBe("string");
    expect(sessionId).toContain("peer-sess");
  });
});
