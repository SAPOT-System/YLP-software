import NetInfo from "@react-native-community/netinfo";
import { NetworkConfig } from "../network-config";

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()), // returns unsubscribe fn
}));

jest.mock("react-native-network-info", () => ({
  NetworkInfo: {
    getIPV4Address: jest.fn().mockResolvedValue("192.168.1.10"),
  },
}));

describe("NetworkConfig", () => {
  let config: NetworkConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    config = new NetworkConfig();
  });

  describe("startWatching", () => {
    it("subscribes to NetInfo on startWatching", () => {
      config.startWatching();
      expect(NetInfo.addEventListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it("updates ipAddress when a different IP is reported", () => {
      let capturedListener: ((state: unknown) => void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        capturedListener = listener as (state: unknown) => void;
        return jest.fn();
      });

      config.ipAddress = "192.168.1.10";
      config.startWatching();

      capturedListener?.({
        type: "wifi",
        details: { ipAddress: "192.168.1.55" },
      });

      expect(config.ipAddress).toBe("192.168.1.55");
    });

    it("does not update ipAddress when the same IP is reported", () => {
      let capturedListener: ((state: unknown) => void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        capturedListener = listener as (state: unknown) => void;
        return jest.fn();
      });

      config.ipAddress = "192.168.1.10";
      config.startWatching();

      capturedListener?.({
        type: "wifi",
        details: { ipAddress: "192.168.1.10" },
      });

      expect(config.ipAddress).toBe("192.168.1.10");
    });

    it("does not update ipAddress for non-wifi connections", () => {
      let capturedListener: ((state: unknown) => void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        capturedListener = listener as (state: unknown) => void;
        return jest.fn();
      });

      config.ipAddress = "192.168.1.10";
      config.startWatching();

      capturedListener?.({ type: "cellular", details: { ipAddress: "10.0.0.1" } });

      expect(config.ipAddress).toBe("192.168.1.10");
    });
  });

  describe("setOnNetworkRegained", () => {
    it("fires immediately when Wi-Fi returns with the same IP address", async () => {
      let capturedListener: ((state: unknown) => Promise<void> | void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        capturedListener = listener as (state: unknown) => Promise<void> | void;
        return jest.fn();
      });
      const onNetworkRegained = jest.fn();

      config.ipAddress = "192.168.1.10";
      config.setOnNetworkRegained(onNetworkRegained);
      config.startWatching();

      await capturedListener?.({ type: "none", isConnected: false, details: null });
      await capturedListener?.({
        type: "wifi",
        isConnected: true,
        details: { ipAddress: "192.168.1.10" },
      });

      expect(onNetworkRegained).toHaveBeenCalledTimes(1);
      expect(onNetworkRegained).toHaveBeenCalledWith();
    });

    it("does not treat the initial online state as a reconnection", async () => {
      let capturedListener: ((state: unknown) => Promise<void> | void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        capturedListener = listener as (state: unknown) => Promise<void> | void;
        return jest.fn();
      });
      const onNetworkRegained = jest.fn();

      config.setOnNetworkRegained(onNetworkRegained);
      config.startWatching();
      await capturedListener?.({
        type: "wifi",
        isConnected: true,
        details: { ipAddress: "192.168.1.10" },
      });

      expect(onNetworkRegained).not.toHaveBeenCalled();
    });
  });

  describe("setOnIpChange", () => {
    const captureListener = () => {
      let captured: ((state: unknown) => Promise<void> | void) | undefined;
      jest.mocked(NetInfo.addEventListener).mockImplementation((listener) => {
        captured = listener as (state: unknown) => Promise<void> | void;
        return jest.fn();
      });
      return () => captured;
    };

    it("fires the callback (debounced) when the wifi IP changes", async () => {
      jest.useFakeTimers();
      const getListener = captureListener();
      const onIpChange = jest.fn();

      config.setOnIpChange(onIpChange);
      config.ipAddress = "192.168.1.10";
      config.startWatching();

      await getListener()?.({
        type: "wifi",
        details: { ipAddress: "192.168.1.55" },
      });

      // Debounced — not invoked immediately.
      expect(onIpChange).not.toHaveBeenCalled();

      jest.advanceTimersByTime(3000);
      expect(onIpChange).toHaveBeenCalledWith("192.168.1.55");
      jest.useRealTimers();
    });

    it("does not fire the callback when the IP is unchanged", async () => {
      jest.useFakeTimers();
      const getListener = captureListener();
      const onIpChange = jest.fn();

      config.setOnIpChange(onIpChange);
      config.ipAddress = "192.168.1.10";
      config.startWatching();

      await getListener()?.({
        type: "wifi",
        details: { ipAddress: "192.168.1.10" },
      });
      jest.advanceTimersByTime(3000);

      expect(onIpChange).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it("stopWatching cancels a pending debounced callback", async () => {
      jest.useFakeTimers();
      const getListener = captureListener();
      const onIpChange = jest.fn();

      config.setOnIpChange(onIpChange);
      config.ipAddress = "192.168.1.10";
      config.startWatching();

      await getListener()?.({
        type: "wifi",
        details: { ipAddress: "192.168.1.55" },
      });
      config.stopWatching();
      jest.advanceTimersByTime(3000);

      expect(onIpChange).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe("stopWatching", () => {
    it("calls the unsubscribe function on stopWatching", () => {
      const unsubscribe = jest.fn();
      jest.mocked(NetInfo.addEventListener).mockReturnValue(unsubscribe);

      config.startWatching();
      config.stopWatching();

      expect(unsubscribe).toHaveBeenCalled();
    });

    it("is safe to call stopWatching without startWatching", () => {
      expect(() => config.stopWatching()).not.toThrow();
    });
  });
});
