import { NetworkInfo } from "react-native-network-info";

export class NetworkConfig {
  readonly port: number;
  ipAddress: string | null = null;

  constructor() {
    this.port = this.generatePort();
  }

  async initialize() {
    try {
      this.ipAddress = await NetworkInfo.getIPV4Address();
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
