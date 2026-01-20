import { NetworkInfo } from "react-native-network-info";

export class NetworkConfig {
  readonly port: number;
  ipAddress: string | null = null;

  constructor() {
    this.port = this.generatePort();
  }

  async initialize() {
    this.ipAddress = await NetworkInfo.getIPV4Address();
  }

  private generatePort(): number {
    return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
  }
}
