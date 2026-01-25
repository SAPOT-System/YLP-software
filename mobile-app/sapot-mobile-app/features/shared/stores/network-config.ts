import { NetworkInfo } from "react-native-network-info";

export class NetworkConfig {
  readonly port: number;
  ipAddress: string;

  constructor() {
    this.port = this.generatePort();
    this.ipAddress = "";
  }

  async initialize() {
    try {
      const ip = await NetworkInfo.getIPV4Address();
      if (!ip) {
        throw new Error("Failed to obtain a valid IP address.");
      }
      this.ipAddress = ip;
    } catch (error) {
      console.error(
        "[NetworkConfig]: Error initializing network configuration:",
        error
      );
      throw error;
    }
  }

  private generatePort(): number {
    try {
      return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
    } catch (error) {
      console.error("[NetworkConfig]: Error generating port:", error);
      throw error;
    }
  }
}
