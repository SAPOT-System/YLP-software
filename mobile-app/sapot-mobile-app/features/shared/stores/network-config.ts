import NetInfo from "@react-native-community/netinfo";
import { NetworkInfo } from "react-native-network-info";
import { networkLog } from "../utils/logger";
import { saveLocalIp, saveLocalPort } from "./secure-config";

networkLog.debug("[network-config] module loaded");

/**
 * NetworkConfig manages network-related configuration such as port and IP address.
 */
export class NetworkConfig {
  readonly port: number;
  ipAddress: string;
  private unsubscribeNetInfo?: () => void;

  /**
   * Constructs a NetworkConfig instance and generates a random port.
   */
  constructor() {
    this.port = this.generatePort();
    this.ipAddress = "";
    networkLog.info("network › config constructed", { port: this.port });
  }

  /**
   * Initializes the network configuration by obtaining the device's IP address.
   * @throws Error if a valid IP address cannot be obtained
   */
  async initialize() {
    try {
      networkLog.info("network › init start");
      const ip = await NetworkInfo.getIPV4Address();
      if (!ip) {
        throw new Error("Failed to obtain a valid IP address.");
      }
      this.ipAddress = ip;

      // Persist so background task always reads the latest values
      await saveLocalIp(ip);
      await saveLocalPort(this.port);

      networkLog.info("network › init complete", {
        hasIp: Boolean(this.ipAddress),
      });
    } catch (error) {
      networkLog.error("network › init failed", { error });
      throw error;
    }
  }

  /**
   * Subscribes to network state changes and updates ipAddress when the WiFi IP changes.
   */
  startWatching(): void {
    networkLog.info("network › watch start");
    this.unsubscribeNetInfo = NetInfo.addEventListener(async (state) => {
      if (state.type === "wifi") {
        const newIp = (state.details as { ipAddress?: string } | null)
          ?.ipAddress;
        if (newIp && newIp !== this.ipAddress) {
          networkLog.info("network › ip changed", {
            hadIp: Boolean(this.ipAddress),
            hasNewIp: true,
          });
          this.ipAddress = newIp;
          // Persist immediately so background task picks it up on next wake
          await saveLocalIp(newIp);
        }
      }
    });
  }

  /**
   * Unsubscribes from network state change listener.
   */
  stopWatching(): void {
    networkLog.info("network › watch stop");
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = undefined;
  }

  /**
   * Generates a random port number in the dynamic/private range (49152–65535).
   * @returns number The generated port
   * @throws Error if port generation fails
   */
  private generatePort(): number {
    try {
      return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
    } catch (error) {
      networkLog.error("network › port generation failed", { error });
      throw error;
    }
  }
}
