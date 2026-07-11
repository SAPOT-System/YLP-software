import { ZeroconfAdapter } from "@/features/shared/connection/adapters";
import type { Service } from "react-native-zeroconf";
import { discoverServerIp } from "../server-discovery-service";

function createTestServerService(overrides: Partial<Service> = {}): Service {
  return {
    name: "sapot-server",
    host: "sapot-server.local",
    fullName: "sapot-server.local._sapot-server._tcp.local.",
    port: 443,
    addresses: ["192.168.1.50"],
    txt: {},
    ...overrides,
  };
}

let mockZeroconfInstance: {
  on: jest.Mock;
  removeListener: jest.Mock;
  scan: jest.Mock;
  stop: jest.Mock;
  emit: (event: string, ...args: unknown[]) => void;
};

jest.mock("react-native-zeroconf", () => {
  return jest.fn().mockImplementation(() => {
    const listeners: Record<string, Set<(...args: unknown[]) => void>> = {};

    const addListener = (event: string, listener: (...args: unknown[]) => void) => {
      if (!listeners[event]) {
        listeners[event] = new Set();
      }
      listeners[event].add(listener);
    };

    const removeListener = (
      event: string,
      listener: (...args: unknown[]) => void
    ) => {
      listeners[event]?.delete(listener);
    };

    const emit = (event: string, ...args: unknown[]) => {
      listeners[event]?.forEach((listener) => listener(...args));
    };

    mockZeroconfInstance = {
      on: jest.fn(addListener),
      removeListener: jest.fn(removeListener),
      scan: jest.fn(),
      stop: jest.fn(),
      emit,
    };

    return mockZeroconfInstance;
  });
});

describe("discoverServerIp", () => {
  let adapter: ZeroconfAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    adapter = new ZeroconfAdapter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("resolves with the IP and CA fingerprint when the adapter emits a resolved server service", async () => {
    const promise = discoverServerIp(adapter, 5000);

    const service = createTestServerService({
      txt: { caFp: "AA:BB:CC" },
    });

    adapter.emit("serviceResolved", service);

    await expect(promise).resolves.toEqual({
      ip: "192.168.1.50",
      caFp: "AA:BB:CC",
    });
    expect(mockZeroconfInstance.scan).toHaveBeenCalledWith(
      "sapot-server",
      "tcp",
      "local."
    );
  });

  it("resolves with the IP and no caFp when the TXT record omits it", async () => {
    const promise = discoverServerIp(adapter, 5000);

    const service = createTestServerService();

    adapter.emit("serviceResolved", service);

    await expect(promise).resolves.toEqual({ ip: "192.168.1.50" });
  });

  it("resolves null when no service is resolved before the timeout elapses", async () => {
    const promise = discoverServerIp(adapter, 5000);

    const expectation = expect(promise).resolves.toBeNull();
    await jest.advanceTimersByTimeAsync(5000);
    await expectation;
  });

  it("removes its resolve listener after timing out (no listener leak)", async () => {
    const promise = discoverServerIp(adapter, 5000);
    await jest.advanceTimersByTimeAsync(5000);
    await promise;

    expect(adapter.listenerCount("serviceResolved")).toBe(0);
  });

  it("removes its resolve listener after resolving (no listener leak)", async () => {
    const promise = discoverServerIp(adapter, 5000);

    const service = createTestServerService();
    adapter.emit("serviceResolved", service);

    await promise;

    expect(adapter.listenerCount("serviceResolved")).toBe(0);
  });

  it("restarts the standing peer-discovery scan afterward if it was active", async () => {
    adapter.startScan();
    jest.clearAllMocks();

    const promise = discoverServerIp(adapter, 5000);
    await jest.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockZeroconfInstance.scan).toHaveBeenCalledWith(
      "lanchat",
      "tcp",
      "local."
    );
  });
});
