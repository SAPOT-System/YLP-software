import {
    createTestDiscoveredService,
    createTestZeroconfService,
} from "@/test/factories/peer-service.factory";
import { ZeroconfAdapter } from "../zeroconf-adapter";

let mockZeroconfInstance: {
  on: jest.Mock;
  removeListener: jest.Mock;
  scan: jest.Mock;
  stop: jest.Mock;
  publishService: jest.Mock;
  unpublishService: jest.Mock;
  removeDeviceListeners: jest.Mock;
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
      publishService: jest.fn(),
      unpublishService: jest.fn(),
      removeDeviceListeners: jest.fn(),
      emit,
    };

    return mockZeroconfInstance;
  });
});

describe("ZeroconfAdapter", () => {
  let adapter: ZeroconfAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    adapter = new ZeroconfAdapter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates adapter", () => {
    expect(adapter).toBeDefined();
  });

  it("starts scanning for services", () => {
    adapter.startScan();

    // The adapter's zeroconf instance should have been called
    expect(adapter).toBeDefined();
  });

  it("emits serviceResolved event", () => {
    const service = createTestZeroconfService({
      name: "test-service",
      txt: { id: "peer-1", username: "Alice" },
    });

    const listener = jest.fn();
    adapter.on("serviceResolved", listener);

    adapter.emit("serviceResolved", service);

    expect(listener).toHaveBeenCalledWith(service);
  });

  it("emits serviceRemoved event", () => {
    const serviceName = "test-service";
    const listener = jest.fn();
    adapter.on("serviceRemoved", listener);

    adapter.emit("serviceRemoved", serviceName);

    expect(listener).toHaveBeenCalledWith(serviceName);
  });

  it("stops scanning", () => {
    adapter.stopScan();

    expect(adapter).toBeDefined();
  });

  it("publishes a service", () => {
    const service = {
      type: "_lanchat._tcp",
      protocol: "tcp",
      domain: "local.",
      name: createTestDiscoveredService({ serviceName: "test-device" })
        .serviceName,
      port: 3000,
      txt: { id: "device-1", username: "Alice", firstName: "Alice" },
    };

    const publishPromise = adapter.publishService(service);

    // Fast-forward timers to trigger the setTimeout
    jest.advanceTimersByTime(500);

    mockZeroconfInstance.emit("published", { name: service.name });

    expect(mockZeroconfInstance.publishService).toHaveBeenCalledWith(
      service.type,
      service.protocol,
      service.domain,
      service.name,
      service.port,
      service.txt
    );

    return expect(publishPromise).resolves.toBeUndefined();
  });

  it("rejects when publish times out", async () => {
    const service = {
      type: "_lanchat._tcp",
      protocol: "tcp",
      domain: "local.",
      name: "test-device",
      port: 3000,
      txt: { id: "device-1", username: "Alice", firstName: "Alice" },
    };

    const publishPromise = adapter.publishService(service);

    jest.advanceTimersByTime(5000);

    await expect(publishPromise).rejects.toThrow(
      "Timed out waiting for Zeroconf to publish test-device"
    );
    expect(mockZeroconfInstance.removeListener).toHaveBeenCalledWith(
      "published",
      expect.any(Function)
    );
    expect(mockZeroconfInstance.removeListener).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );
  });

  it("cleans up resources", () => {
    const serviceName = "test-service";
    adapter.cleanUp(serviceName);

    expect(mockZeroconfInstance.unpublishService).toHaveBeenCalledWith(
      serviceName
    );
  });
});
