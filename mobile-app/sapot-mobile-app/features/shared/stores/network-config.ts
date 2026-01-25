import { NetworkInfo } from "react-native-network-info";

/**
 * NetworkConfig manages network-related configuration such as port and IP address.
 */
export class NetworkConfig {
  readonly port: number;
  ipAddress: string;

  /**
   * Constructs a NetworkConfig instance and generates a random port.
   */
  constructor() {
    this.port = this.generatePort();
    this.ipAddress = "";
  }

  /**
   * Initializes the network configuration by obtaining the device's IP address.
   * @throws Error if a valid IP address cannot be obtained
   */
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

  /**
   * Generates a random port number in the dynamic/private range (49152–65535).
   * @returns number The generated port
   * @throws Error if port generation fails
   */
  private generatePort(): number {
    try {
      return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
    } catch (error) {
      console.error("[NetworkConfig]: Error generating port:", error);
      throw error;
    }
  }
}
