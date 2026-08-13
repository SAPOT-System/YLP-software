import * as Location from "expo-location";

import { GpsLocationService } from "../gps-location-service";

jest.mock("expo-location", () => ({
  Accuracy: { Balanced: 3 },
  watchPositionAsync: jest.fn(),
}));

interface ConstructorCall {
  url: string;
  protocols?: string | string[];
}

class MockWebSocket {
  static OPEN = 1;
  static calls: ConstructorCall[] = [];
  static instances: MockWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null;
  send = jest.fn();

  constructor(url: string, protocols?: string | string[]) {
    MockWebSocket.calls.push({ url, protocols });
    MockWebSocket.instances.push(this);
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

describe("GpsLocationService WebSocket authentication", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.calls = [];
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    jest.mocked(Location.watchPositionAsync).mockResolvedValue({
      remove: jest.fn(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the token out of the GPS URL and offers it as a subprotocol", async () => {
    const service = new GpsLocationService();

    await service.start("https://server.sapot.lan/", "user/id", "gps-token");

    expect(MockWebSocket.calls[0]).toEqual({
      url: "wss://server.sapot.lan/gps/ws/user%2Fid",
      protocols: ["sapot.jwt", "gps-token"],
    });
    expect(MockWebSocket.calls[0].url).not.toContain("gps-token");

    service.stop();
  });

  it("reuses the current token as a subprotocol when reconnecting", async () => {
    const service = new GpsLocationService();
    await service.start("wss://server.sapot.lan", "user-id", "current-token");

    MockWebSocket.instances[0].onclose?.({
      code: 1006,
      reason: "network_lost",
      wasClean: false,
    });
    jest.advanceTimersByTime(3_000);

    expect(MockWebSocket.calls[1]).toEqual({
      url: "wss://server.sapot.lan/gps/ws/user-id",
      protocols: ["sapot.jwt", "current-token"],
    });

    service.stop();
  });
});
