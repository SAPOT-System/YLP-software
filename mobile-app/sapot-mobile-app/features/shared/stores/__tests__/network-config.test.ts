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
