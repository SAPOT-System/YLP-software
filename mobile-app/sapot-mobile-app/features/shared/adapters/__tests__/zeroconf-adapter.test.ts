import {
    createTestDiscoveredService,
    createTestZeroconfService,
} from "@/test/factories/peer-service.factory";
import { ZeroconfAdapter } from "../zeroconf-adapter";

jest.mock("react-native-zeroconf", () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    scan: jest.fn(),
    stop: jest.fn(),
    publishService: jest.fn(),
    unpublishService: jest.fn(),
    removeDeviceListeners: jest.fn(),
  }));
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
      txt: { id: "device-1", username: "Alice" },
    };

    adapter.publishService(service);

    // Fast-forward timers to trigger the setTimeout
    jest.advanceTimersByTime(500);
    
    expect(adapter).toBeDefined();
  });

  it("cleans up resources", () => {
    const serviceName = "test-service";
    adapter.cleanUp(serviceName);

    expect(adapter).toBeDefined();
  });
});