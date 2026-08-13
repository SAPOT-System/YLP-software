import { WsSignalingAdapter } from "../ws-signaling-adapter";

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
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null;
  send = jest.fn();

  constructor(url: string, protocols?: string | string[]) {
    MockWebSocket.calls.push({ url, protocols });
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 });
  }
}

describe("WsSignalingAdapter authentication", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockWebSocket.calls = [];
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps the token out of the URL and offers it as a subprotocol", async () => {
    const adapter = new WsSignalingAdapter();
    const connectPromise = adapter.connect({
      baseUrl: "https://server.sapot.lan/",
      token: "secret-token",
      extraQuery: { target_id: "peer-id" },
    });

    MockWebSocket.instances[0].open();
    await connectPromise;

    expect(MockWebSocket.calls[0]).toEqual({
      url: "wss://server.sapot.lan/ws/?target_id=peer-id",
      protocols: ["sapot.jwt", "secret-token"],
    });
    expect(MockWebSocket.calls[0].url).not.toContain("secret-token");

    adapter.disconnect();
  });

  it("reuses the current token as a subprotocol when reconnecting", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.5);
    const adapter = new WsSignalingAdapter();
    const connectPromise = adapter.connect({
      baseUrl: "wss://server.sapot.lan",
      token: "current-token",
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 100,
    });

    MockWebSocket.instances[0].open();
    await connectPromise;
    MockWebSocket.instances[0].onclose?.({
      code: 1006,
      reason: "network_lost",
      wasClean: false,
    });

    jest.advanceTimersByTime(100);

    expect(MockWebSocket.calls).toHaveLength(2);
    expect(MockWebSocket.calls[1]).toEqual({
      url: "wss://server.sapot.lan/ws/",
      protocols: ["sapot.jwt", "current-token"],
    });

    MockWebSocket.instances[1].open();
    adapter.disconnect();
  });
});
